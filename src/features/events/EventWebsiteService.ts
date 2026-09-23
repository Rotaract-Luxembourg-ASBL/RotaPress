import "server-only";
import { eventCatalogueQuery, selectPublishedEvents } from "./event_catalogue";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { form } from "../../../db/schema/forms";
import { registrationSettings } from "../../../db/schema/registrations";
import type { EventModuleKey } from "./event_modules";
import { clubEvent } from "../../../db/schema/events";
import { installation } from "../../../db/schema/club";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
  type DatabaseExecutor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { CmsService } from "../cms/CmsService";
import { cmsLocaleSchema } from "../cms/cms_schemas";
import { EventPublicAccess } from "./EventPublicAccess";
import { EventService } from "./EventService";
import { EventModuleService } from "./EventModuleService";
import { eventFieldsSchema, eventVersionSchema } from "./event_schemas";
import { eventPageModuleKeySchema } from "./event_modules";
import { expectedInput } from "../cms/cms_commands";
import { cmsContent } from "../../../db/schema/cms";
import { EventRevisionWriter } from "./EventRevisionWriter";

const publicationInput = eventVersionSchema.extend({
  operation: z.enum(["publish", "unpublish"]),
  confirmed: z.literal(true),
  pages: z.array(expectedInput).max(12).default([]),
});
export class EventWebsiteService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
    private readonly cms: CmsService,
    private readonly externalRegistration?: {
      publicLink(
        actor: TrustedActor | null,
        eventId: string,
      ): Promise<string | null>;
    },
  ) {}

  async workspace(actor: TrustedActor, id: string) {
    await this.events.detail(actor, id);
    const { organizationId } = await this.authorization.approved(actor);
    const [row] = await this.db
      .select({
        publishedAt: clubEvent.publishedAt,
        published: clubEvent.published,
      })
      .from(clubEvent)
      .where(
        and(eq(clubEvent.id, id), eq(clubEvent.organizationId, organizationId)),
      );
    const [registration] = await this.db
      .select({ authority: registrationSettings.authority })
      .from(registrationSettings)
      .where(
        and(
          eq(registrationSettings.organizationId, organizationId),
          eq(registrationSettings.eventId, id),
        ),
      );
    return {
      modules: await this.modules.states(organizationId, id),
      registrationAuthority: registration?.authority ?? "none",
      pages: await this.cms.eventPages(actor, id),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      publishedVisibility: row.published
        ? eventFieldsSchema.parse(row.published).visibility
        : null,
    };
  }

  async publication(actor: TrustedActor, input: unknown) {
    const parsed = publicationInput.parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.events.lockEvent(
        actor,
        parsed.id,
        tx,
      );
      this.events.requireCapability(event, "events.publish");
      this.events.requireEditableVersion(event, parsed.expectedVersion);
      if (parsed.operation === "publish") {
        this.events.requireActive(event);
        await this.modules.requireEnabled(
          organizationId,
          event.id,
          "website",
          tx,
        );
        for (const page of parsed.pages) {
          const [owned] = await tx
            .select({ id: cmsContent.id })
            .from(cmsContent)
            .where(
              and(
                eq(cmsContent.id, page.id),
                eq(cmsContent.eventId, event.id),
                eq(cmsContent.organizationId, organizationId),
              ),
            );
          if (!owned)
            throw new DomainError(
              "EVENT_PAGE_SCOPE",
              "Choose pages belonging to this event.",
              403,
            );
          await this.cms.publishRevision(actor, page, tx);
        }
        await this.cms.requireEventLanding(organizationId, event.id, tx);
      } else if (parsed.pages.length) {
        throw new DomainError(
          "EVENT_PUBLICATION_INPUT",
          "Page selection applies only to publication.",
          422,
        );
      }
      const published =
        parsed.operation === "publish"
          ? eventFieldsSchema.parse({
              title: event.title,
              description: event.description,
              startsAt: event.startsAt,
              endsAt: event.endsAt,
              timezone: event.timezone,
              venue: event.venue,
              visibility: event.visibility,
            })
          : null;
      await tx
        .update(clubEvent)
        .set({
          published,
          publishedAt: published ? new Date() : null,
          featured: published?.visibility === "public" ? event.featured : false,
          version: event.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(clubEvent.id, event.id));
      if (published)
        await new EventRevisionWriter().append(
          tx,
          actor,
          organizationId,
          await this.events.detail(actor, event.id, tx),
          "published",
        );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: `event.${parsed.operation}ed`,
        targetId: event.id,
      });
    });
    return this.events.detail(actor, parsed.id);
  }

  async publicPage(
    rawId: unknown,
    rawLocale: unknown,
    rawModule: unknown,
    actor: TrustedActor | null = null,
  ) {
    const result = await this.db.transaction(
      (tx) => this.readPublicPage(rawId, rawLocale, rawModule, actor, tx),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    if (!result) return null;
    const lumaUrl = result.cancelled
      ? null
      : ((await this.externalRegistration?.publicLink(actor, result.eventId)) ??
        null);
    if (lumaUrl)
      result.navigation.push({
        key: "registration",
        href: `/events/${result.slug}/${result.page.locale}/registration`,
      });
    return { ...result, lumaUrl };
  }

  private async readPublicPage(
    rawId: unknown,
    rawLocale: unknown,
    rawModule: unknown,
    actor: TrustedActor | null,
    executor: DatabaseExecutor,
  ) {
    const parsed = z
      .object({
        id: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(160),
        locale: cmsLocaleSchema,
        key: eventPageModuleKeySchema,
      })
      .safeParse({ id: rawId, locale: rawLocale, key: rawModule });
    if (!parsed.success) return null;
    const { locale, key } = parsed.data;
    const [identity] = await executor
      .select({
        id: clubEvent.id,
        slug: clubEvent.slug,
        publishedAt: clubEvent.publishedAt,
      })
      .from(installation)
      .innerJoin(
        clubEvent,
        eq(clubEvent.organizationId, installation.organizationId),
      )
      .where(
        and(
          eq(installation.id, 1),
          z.uuid().safeParse(parsed.data.id).success
            ? eq(clubEvent.id, parsed.data.id)
            : eq(clubEvent.slug, parsed.data.id),
        ),
      );
    if (!identity) return null;
    const id = identity.id;
    let access;
    try {
      access = await new EventPublicAccess(
        this.db,
        this.events,
        this.modules,
      ).require(actor, id, key, executor);
    } catch (error) {
      if (error instanceof DomainError && error.status === 404) return null;
      throw error;
    }
    const row = { organizationId: access.organizationId };
    const event = access.event;
    const states = await this.modules.states(row.organizationId, id, executor);
    const features = await this.authorization.features.flags(
      row.organizationId,
      executor,
    );
    const active = (candidate: string) =>
      (candidate !== "forms" || features.forms) &&
      states.some((item) => item.key === candidate && item.state === "enabled");
    if (!active("website") || !active(key)) return null;
    const pages = (
      await this.cms.publishedEventPages(
        row.organizationId,
        id,
        locale,
        executor,
      )
    )
      .filter((item) => active(item.moduleKey))
      .sort(
        (a, b) =>
          states.findIndex((item) => item.key === a.moduleKey) -
          states.findIndex((item) => item.key === b.moduleKey),
      );
    const selected = pages.find((item) => item.moduleKey === key);
    if (!selected) return null;
    const navigation: { key: EventModuleKey; href: string }[] = pages.map(
      (item) => ({
        key: item.moduleKey,
        href: `/events/${identity.slug}/${locale}/${item.moduleKey}`,
      }),
    );
    if (!access.cancelled && active("forms")) {
      const [publishedForm] = await executor
        .select({ id: form.id })
        .from(form)
        .where(
          and(
            eq(form.eventId, id),
            eq(form.organizationId, row.organizationId),
            eq(form.kind, "event"),
            eq(form.archived, false),
            isNotNull(form.publishedVersionId),
          ),
        )
        .limit(1);
      if (publishedForm)
        navigation.push({
          key: "forms",
          href: `/events/${identity.slug}/${locale}/forms`,
        });
      if (active("registration")) {
        const [configured] = await executor
          .select({ id: form.id })
          .from(registrationSettings)
          .innerJoin(form, eq(form.id, registrationSettings.formId))
          .where(
            and(
              eq(registrationSettings.eventId, id),
              eq(registrationSettings.organizationId, row.organizationId),
              eq(registrationSettings.authority, "native"),
              eq(form.archived, false),
              isNotNull(form.publishedVersionId),
            ),
          );
        if (configured)
          navigation.push({
            key: "registration",
            href: `/events/${identity.slug}/${locale}/registration`,
          });
      }
    }
    return {
      eventId: id,
      slug: identity.slug,
      publishedAt: identity.publishedAt?.toISOString() ?? "",
      event,
      cancelled: access.cancelled,
      page: selected.page,
      navigation,
    };
  }

  async catalogue(actor: TrustedActor, input: unknown) {
    const scope = await this.authorization.approved(actor);
    await this.authorization.features.require(scope.organizationId, "events");
    if (
      !scope.capabilities.includes("cms.edit") &&
      !(await this.events.hasAccess(actor))
    ) {
      throw new DomainError(
        "ACCESS_DENIED",
        "Website or event editor access is required.",
        403,
      );
    }
    const query = eventCatalogueQuery.parse(input);
    return selectPublishedEvents(
      await this.publicList(query.locale),
      query.period,
      query.limit,
    );
  }

  async publicList(rawLocale: unknown) {
    if (!(await this.authorization.features.installed()).events) return [];
    const locale = cmsLocaleSchema.parse(rawLocale);
    const rows = await this.db
      .select({
        id: clubEvent.id,
        published: clubEvent.published,
        featured: clubEvent.featured,
      })
      .from(installation)
      .innerJoin(
        clubEvent,
        eq(clubEvent.organizationId, installation.organizationId),
      )
      .where(
        and(
          eq(installation.id, 1),
          isNull(clubEvent.archivedAt),
          isNotNull(clubEvent.published),
        ),
      );
    const result = [];
    for (const row of rows) {
      if (eventFieldsSchema.parse(row.published).visibility !== "public")
        continue;
      const page = await this.publicPage(row.id, locale, "website");
      // The current projection may have changed visibility since discovery.
      if (page && page.event.visibility === "public")
        result.push({
          id: row.id,
          featured: row.featured && !page.cancelled,
          ...page.event,
          cancelled: page.cancelled,
          imageId: page.page.socialImageId,
          href: `/events/${page.slug}/${locale}/website`,
        });
    }
    return result.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
}
