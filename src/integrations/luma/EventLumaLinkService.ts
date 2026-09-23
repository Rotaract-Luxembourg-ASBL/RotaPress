import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { lumaEventLink } from "../../../db/schema/integrations";
import { eventPackageSource } from "../../../db/schema/event-packages";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { EventService } from "../../features/events/EventService";
import { EventModuleService } from "../../features/events/EventModuleService";
import { EventPublicAccess } from "../../features/events/EventPublicAccess";
import { RegistrationService } from "../../features/events/RegistrationService";
import { LumaAvailabilityService } from "./LumaAvailabilityService";
import {
  lumaEventUrlSchema,
  lumaLinkDraftSchema,
  lumaLinkPublicationSchema,
  type LumaLinkDto,
} from "./luma_schemas";

/** Validated link publication only. No provider requests, embeds or credentials. */
export class EventLumaLinkService {
  private readonly audit = new AuditRepository();
  private readonly publicAccess: EventPublicAccess;
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
    private readonly registrations: RegistrationService,
    private readonly availability: LumaAvailabilityService,
  ) {
    this.publicAccess = new EventPublicAccess(db, events, modules);
  }
  private async row(
    organizationId: string,
    eventId: string,
    executor: DatabaseExecutor,
  ) {
    const [row] = await executor
      .select()
      .from(lumaEventLink)
      .where(
        and(
          eq(lumaEventLink.organizationId, organizationId),
          eq(lumaEventLink.eventId, eventId),
        ),
      );
    return row;
  }
  private async dto(
    organizationId: string,
    eventId: string,
    executor: DatabaseExecutor,
  ): Promise<LumaLinkDto> {
    const row = await this.row(organizationId, eventId, executor);
    const registration = await this.registrations.authoritySnapshot(
      organizationId,
      eventId,
      executor,
    );
    return {
      enabled: await this.availability.enabled(organizationId, executor),
      version: row?.version ?? 0,
      draftUrl: row?.draftUrl ?? "",
      publishedUrl: row?.publishedUrl ?? null,
      published: Boolean(row?.publishedAt),
      registrationVersion: registration.version,
      authority: registration.authority,
    };
  }
  async workspace(actor: TrustedActor, eventId: string) {
    const event = await this.events.detail(actor, eventId);
    this.events.requireCapability(event, "events.edit");
    const { organizationId } = await this.authorization.approved(actor);
    return this.dto(organizationId, eventId, this.db);
  }

  /** Readiness never discloses a draft URL or integration credentials. */
  async readiness(
    actor: TrustedActor,
    eventId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    await this.events.detail(actor, eventId, executor);
    const { organizationId } = await this.authorization.approved(
      actor,
      executor,
    );
    const row = await this.row(organizationId, eventId, executor);
    return {
      enabled: await this.availability.enabled(organizationId, executor),
      published: Boolean(
        row?.publishedAt &&
        lumaEventUrlSchema.safeParse(row.publishedUrl).success,
      ),
    };
  }
  async save(actor: TrustedActor, eventId: string, input: unknown) {
    z.uuid().parse(eventId);
    const values = lumaLinkDraftSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.events.lockEvent(
        actor,
        eventId,
        tx,
      );
      this.events.requireCapability(event, "events.edit");
      this.events.requireActive(event);
      if (event.archived)
        throw new DomainError("EVENT_ARCHIVED", "This event is archived.", 409);
      const current = await this.row(organizationId, eventId, tx);
      if ((current?.version ?? 0) !== values.expectedVersion)
        throw new DomainError(
          "LUMA_LINK_CHANGED",
          "Reload the saved Luma link before saving. Your entered link has been retained.",
          409,
        );
      await tx
        .insert(lumaEventLink)
        .values({
          organizationId,
          eventId,
          draftUrl: values.url,
          version: values.expectedVersion + 1,
        })
        .onConflictDoUpdate({
          target: lumaEventLink.eventId,
          set: { draftUrl: values.url, version: values.expectedVersion + 1 },
        });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "integration.luma.link_draft_saved",
        targetId: eventId,
      });
      return this.dto(organizationId, eventId, tx);
    });
  }
  async publication(actor: TrustedActor, eventId: string, input: unknown) {
    z.uuid().parse(eventId);
    const values = lumaLinkPublicationSchema.parse(input);
    this.authorization.requireRecent(actor);
    return this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.events.lockEvent(
        actor,
        eventId,
        tx,
      );
      this.events.requireCapability(event, "events.publish");
      const row = await this.row(organizationId, eventId, tx);
      if (!row || row.version !== values.expectedVersion)
        throw new DomainError(
          "LUMA_LINK_CHANGED",
          "The saved link changed. Review the current draft again.",
          409,
        );
      const publish = values.operation === "publish";
      if (publish) {
        this.events.requireActive(event);
        if (event.archived)
          throw new DomainError(
            "EVENT_ARCHIVED",
            "This event is archived.",
            409,
          );
        if (!(await this.availability.enabled(organizationId, tx)))
          throw new DomainError(
            "LUMA_DISABLED",
            "A club administrator must allow Luma link mode before publication.",
            409,
          );
        await this.modules.requireEnabled(
          organizationId,
          eventId,
          "registration",
          tx,
        );
        lumaEventUrlSchema.parse(row.draftUrl);
        if (row.publishedUrl && row.publishedUrl !== row.draftUrl)
          throw new DomainError(
            "LUMA_EVENT_LOCKED",
            "This event already selected a Luma destination. Replacing it requires a separate migration decision because provider registrations may exist. Restore the selected link or unpublish it.",
            409,
          );
      }
      await this.registrations.setLumaPublication(
        organizationId,
        eventId,
        values.expectedRegistrationVersion,
        publish,
        tx,
      );
      if (publish) {
        await tx
          .insert(eventPackageSource)
          .values({
            eventId,
            organizationId,
            label: "Registration destination",
            url: row.draftUrl.replace("https://lu.ma/", "https://luma.com/"),
          })
          .onConflictDoNothing({
            target: [eventPackageSource.eventId, eventPackageSource.url],
          });
      }
      await tx
        .update(lumaEventLink)
        .set({
          publishedUrl: publish ? row.draftUrl : row.publishedUrl,
          publishedAt: publish ? new Date() : null,
          version: row.version + 1,
        })
        .where(
          and(
            eq(lumaEventLink.organizationId, organizationId),
            eq(lumaEventLink.eventId, eventId),
          ),
        );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: publish
          ? "integration.luma.link_published"
          : "integration.luma.link_unpublished",
        targetId: eventId,
      });
      return this.dto(organizationId, eventId, tx);
    });
  }
  async publicLink(
    actor: TrustedActor | null,
    eventId: string,
    executor: DatabaseExecutor = this.db,
  ): Promise<string | null> {
    const url = await this.publicRegistrationDestination(
      actor,
      eventId,
      executor,
    );
    if (!url) return null;
    const [source] = await executor
      .select({ id: eventPackageSource.id })
      .from(eventPackageSource)
      .innerJoin(
        lumaEventLink,
        and(
          eq(eventPackageSource.eventId, lumaEventLink.eventId),
          eq(eventPackageSource.organizationId, lumaEventLink.organizationId),
        ),
      )
      .where(
        and(
          eq(eventPackageSource.eventId, eventId),
          eq(
            eventPackageSource.url,
            url.replace("https://lu.ma/", "https://luma.com/"),
          ),
          eq(eventPackageSource.enabled, true),
          eq(lumaEventLink.publishedUrl, url),
          isNotNull(lumaEventLink.publishedAt),
        ),
      );
    return source ? url : null;
  }

  /** Event-wide registration gate; each caller separately checks its selected source. */
  async publicRegistrationDestination(
    actor: TrustedActor | null,
    eventId: string,
    executor: DatabaseExecutor = this.db,
  ): Promise<string | null> {
    try {
      const { organizationId } = await this.publicAccess.require(
        actor,
        eventId,
        "registration",
        executor,
      );
      if (!(await this.availability.enabled(organizationId, executor)))
        return null;
      const registration = await this.registrations.authoritySnapshot(
        organizationId,
        eventId,
        executor,
      );
      if (registration.authority !== "luma" || !registration.open) return null;
      const [row] = await executor
        .select({ url: lumaEventLink.publishedUrl })
        .from(lumaEventLink)
        .where(
          and(
            eq(lumaEventLink.organizationId, organizationId),
            eq(lumaEventLink.eventId, eventId),
            isNotNull(lumaEventLink.publishedAt),
          ),
        );
      return row?.url ? lumaEventUrlSchema.parse(row.url) : null;
    } catch (error) {
      if (error instanceof DomainError && error.status === 404) return null;
      throw error;
    }
  }
}
