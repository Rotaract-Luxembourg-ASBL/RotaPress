import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  eventPackage,
  eventPackageRevision,
  eventPackageSource,
} from "../../../db/schema/event-packages";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { EventLumaLinkService } from "../../integrations/luma/EventLumaLinkService";
import { EventModuleService } from "./EventModuleService";
import { EventService } from "./EventService";
import { EventPublicAccess } from "./EventPublicAccess";
import { RegistrationService } from "./RegistrationService";
import {
  packageDraftSchema,
  packageSaveSchema,
  packageSourceSchema,
  packagePublicationSchema,
  type PublicPackage,
  type PackageWorkspace,
} from "./package_schemas";

/** Local editorial offers. A published outbound link is never purchase evidence. */
export class EventPackageService {
  private readonly audit = new AuditRepository();
  private readonly access: EventPublicAccess;
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
    private readonly registrations: RegistrationService,
    private readonly lumaLinks: EventLumaLinkService,
  ) {
    this.access = new EventPublicAccess(db, events, modules);
  }

  private scope(organizationId: string, eventId: string) {
    return and(
      eq(eventPackage.organizationId, organizationId),
      eq(eventPackage.eventId, eventId),
    );
  }
  private changed() {
    return new DomainError(
      "PACKAGE_CHANGED",
      "This package or booking source changed. Reload and review before continuing.",
      409,
    );
  }
  private async sources(
    organizationId: string,
    eventId: string,
    tx: DatabaseExecutor,
  ) {
    return tx
      .select({
        id: eventPackageSource.id,
        label: eventPackageSource.label,
        url: eventPackageSource.url,
        enabled: eventPackageSource.enabled,
        version: eventPackageSource.version,
      })
      .from(eventPackageSource)
      .where(
        and(
          eq(eventPackageSource.organizationId, organizationId),
          eq(eventPackageSource.eventId, eventId),
        ),
      )
      .orderBy(asc(eventPackageSource.label), asc(eventPackageSource.id));
  }
  private async rows(
    organizationId: string,
    eventId: string,
    tx: DatabaseExecutor,
  ) {
    return tx
      .select({ item: eventPackage, revision: eventPackageRevision })
      .from(eventPackage)
      .leftJoin(
        eventPackageRevision,
        eq(eventPackage.publishedRevisionId, eventPackageRevision.id),
      )
      .where(this.scope(organizationId, eventId))
      .orderBy(asc(eventPackage.id));
  }
  private project(
    row: Awaited<ReturnType<EventPackageService["rows"]>>[number],
    sources: Awaited<ReturnType<EventPackageService["sources"]>>,
    checkoutAvailable: boolean,
  ): PublicPackage | null {
    if (!row.revision) return null;
    const snapshot = packageDraftSchema.parse(row.revision.snapshot);
    const source = sources.find((s) => s.id === row.revision?.sourceId);
    return {
      id: row.item.id,
      revisionId: row.revision.id,
      title: snapshot.title,
      description: snapshot.description,
      position: snapshot.position,
      priceMinor: snapshot.showPrice ? snapshot.priceMinor : null,
      currency: snapshot.showPrice ? snapshot.currency : null,
      checkoutUrl:
        checkoutAvailable && snapshot.checkoutEnabled && source?.enabled
          ? source.url
          : null,
    };
  }
  private async checkoutAvailable(
    actor: TrustedActor,
    organizationId: string,
    eventId: string,
    tx: DatabaseExecutor,
  ) {
    const readiness = await this.lumaLinks.readiness(actor, eventId, tx);
    const registration = await this.registrations.authoritySnapshot(
      organizationId,
      eventId,
      tx,
    );
    const states = await this.modules.states(organizationId, eventId, tx);
    return (
      readiness.enabled &&
      readiness.published &&
      registration.authority === "luma" &&
      registration.open &&
      states.some((s) => s.key === "registration" && s.state === "enabled")
    );
  }
  async workspace(
    actor: TrustedActor,
    eventId: string,
    tx: DatabaseExecutor = this.db,
  ): Promise<PackageWorkspace> {
    z.uuid().parse(eventId);
    const event = await this.events.detail(actor, eventId, tx);
    this.events.requireCapability(event, "events.edit");
    const { organizationId } = await this.authorization.approved(actor, tx);
    const sources = await this.sources(organizationId, eventId, tx);
    const checkoutAvailable =
      !event.archived &&
      !event.cancelled &&
      (await this.checkoutAvailable(actor, organizationId, eventId, tx));
    const rows = await this.rows(organizationId, eventId, tx);
    const websiteEnabled = (
      await this.modules.states(organizationId, eventId, tx)
    ).some((state) => state.key === "website" && state.state === "enabled");
    return {
      sources,
      checkoutAvailable,
      canPublish:
        event.capabilities.includes("events.publish") &&
        websiteEnabled &&
        !event.archived &&
        !event.cancelled,
      canEdit: websiteEnabled && !event.archived && !event.cancelled,
      packages: rows
        .map((row) => ({
          id: row.item.id,
          version: row.item.version,
          draft: packageDraftSchema.parse(row.item.draft),
          sourceId: row.item.sourceId,
          published: this.project(row, sources, checkoutAvailable),
        }))
        .sort(
          (a, b) =>
            a.draft.position - b.draft.position || a.id.localeCompare(b.id),
        ),
    };
  }
  async source(actor: TrustedActor, eventId: string, input: unknown) {
    z.uuid().parse(eventId);
    const values = packageSourceSchema.parse(input);
    if ("id" in values) this.authorization.requireRecent(actor);
    return this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.events.lockEvent(
        actor,
        eventId,
        tx,
      );
      // Changing a live source changes every mapped checkout, so requires publication authority.
      this.events.requireCapability(
        event,
        "id" in values ? "events.publish" : "events.edit",
      );
      this.events.requireActive(event);
      if (event.archived)
        throw new DomainError("EVENT_ARCHIVED", "This event is archived.", 409);
      const sources = await this.sources(organizationId, eventId, tx);
      if (!("id" in values) || values.enabled)
        await this.modules.requireEnabled(
          organizationId,
          eventId,
          "website",
          tx,
        );
      if ("id" in values) {
        const current = sources.find((s) => s.id === values.id);
        if (!current || current.version !== values.expectedVersion)
          throw this.changed();
        await tx
          .update(eventPackageSource)
          .set({
            label: values.label,
            enabled: values.enabled,
            version: current.version + 1,
          })
          .where(eq(eventPackageSource.id, current.id));
      } else {
        const url = values.url.replace("https://lu.ma/", "https://luma.com/");
        if (sources.length >= 50)
          throw new DomainError(
            "PACKAGE_SOURCE_LIMIT",
            "This event already has 50 booking sources.",
            409,
          );
        if (sources.some((s) => s.url === url))
          throw new DomainError(
            "PACKAGE_SOURCE_EXISTS",
            "This booking source already exists. Choose it from the source list.",
            409,
          );
        await tx
          .insert(eventPackageSource)
          .values({ organizationId, eventId, label: values.label, url });
      }
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "event.package_source.saved",
        targetId: eventId,
      });
      return this.workspace(actor, eventId, tx);
    });
  }
  async save(actor: TrustedActor, eventId: string, input: unknown) {
    z.uuid().parse(eventId);
    const values = packageSaveSchema.parse(input);
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
      await this.modules.requireEnabled(organizationId, eventId, "website", tx);
      const sources = await this.sources(organizationId, eventId, tx);
      if (values.sourceId && !sources.some((s) => s.id === values.sourceId))
        throw new DomainError(
          "PACKAGE_SOURCE_INVALID",
          "Choose a booking source belonging to this event.",
          422,
        );
      if (values.draft.checkoutEnabled && !values.sourceId)
        throw new DomainError(
          "PACKAGE_SOURCE_REQUIRED",
          "Choose a booking source before enabling checkout.",
          422,
        );
      const rows = await this.rows(organizationId, eventId, tx);
      const current = rows.find((r) => r.item.id === values.id)?.item;
      if (
        values.id
          ? !current || current.version !== values.expectedVersion
          : values.expectedVersion !== 0
      )
        throw this.changed();
      if (current) {
        await tx
          .update(eventPackage)
          .set({
            draft: values.draft,
            sourceId: values.sourceId,
            version: current.version + 1,
          })
          .where(eq(eventPackage.id, current.id));
      } else {
        if (rows.length >= 50)
          throw new DomainError(
            "PACKAGE_LIMIT",
            "This event already has 50 packages.",
            409,
          );
        await tx.insert(eventPackage).values({
          organizationId,
          eventId,
          draft: values.draft,
          sourceId: values.sourceId,
        });
      }
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "event.package.draft_saved",
        targetId: eventId,
      });
      return this.workspace(actor, eventId, tx);
    });
  }
  async publication(
    actor: TrustedActor,
    eventId: string,
    packageId: string,
    input: unknown,
  ) {
    z.uuid().parse(eventId);
    z.uuid().parse(packageId);
    const values = packagePublicationSchema.parse(input);
    this.authorization.requireRecent(actor);
    return this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.events.lockEvent(
        actor,
        eventId,
        tx,
      );
      this.events.requireCapability(event, "events.publish");
      const row = (await this.rows(organizationId, eventId, tx)).find(
        (r) => r.item.id === packageId,
      )?.item;
      if (!row || row.version !== values.expectedVersion) throw this.changed();
      let publishedRevisionId: string | null = null;
      if (values.operation === "publish") {
        this.events.requireActive(event);
        if (event.archived)
          throw new DomainError(
            "EVENT_ARCHIVED",
            "This event is archived.",
            409,
          );
        await this.modules.requireEnabled(
          organizationId,
          eventId,
          "website",
          tx,
        );
        const snapshot = packageDraftSchema.parse(row.draft);
        if (snapshot.checkoutEnabled) {
          const source = (await this.sources(organizationId, eventId, tx)).find(
            (s) => s.id === row.sourceId,
          );
          if (!source || source.version !== values.expectedSourceVersion)
            throw this.changed();
          if (
            !source.enabled ||
            !(await this.checkoutAvailable(actor, organizationId, eventId, tx))
          )
            throw new DomainError(
              "PACKAGE_CHECKOUT_UNAVAILABLE",
              "Enable the booking source and publish Luma registration before publishing this checkout.",
              409,
            );
        }
        const [revision] = await tx
          .insert(eventPackageRevision)
          .values({
            packageId,
            eventId,
            organizationId,
            snapshot,
            sourceId: snapshot.checkoutEnabled ? row.sourceId : null,
            createdBy: actor.userId,
          })
          .returning({ id: eventPackageRevision.id });
        publishedRevisionId = revision.id;
      }
      await tx
        .update(eventPackage)
        .set({ publishedRevisionId, version: row.version + 1 })
        .where(eq(eventPackage.id, packageId));
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: `event.package.${values.operation === "publish" ? "published" : "unpublished"}`,
        targetId: packageId,
      });
      return this.workspace(actor, eventId, tx);
    });
  }
  async published(
    actor: TrustedActor | null,
    eventId: string,
  ): Promise<PublicPackage[]> {
    z.uuid().parse(eventId);
    try {
      return await this.db.transaction(
        async (tx) => {
          const { organizationId } = await this.access.require(
            actor,
            eventId,
            "website",
            tx,
          );
          const checkoutAvailable = Boolean(
            await this.lumaLinks.publicRegistrationDestination(
              actor,
              eventId,
              tx,
            ),
          );
          const sources = await this.sources(organizationId, eventId, tx);
          return (await this.rows(organizationId, eventId, tx))
            .map((row) => this.project(row, sources, checkoutAvailable))
            .filter((row): row is PublicPackage => row !== null)
            .sort(
              (a, b) => a.position - b.position || a.id.localeCompare(b.id),
            );
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    } catch (error) {
      if (error instanceof DomainError && error.status === 404) return [];
      throw error;
    }
  }
}
