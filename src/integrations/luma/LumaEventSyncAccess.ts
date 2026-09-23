import "server-only";
import { and, eq } from "drizzle-orm";
import { lumaEventLink } from "../../../db/schema/integrations";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import { EventService } from "../../features/events/EventService";
import { EventModuleService } from "../../features/events/EventModuleService";
import { RegistrationService } from "../../features/events/RegistrationService";
import type { EventCapability } from "../../features/events/event_schemas";
import { LumaSourceAccess } from "./LumaSourceAccess";

export class LumaEventSyncAccess {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
    private readonly registrations: RegistrationService,
  ) {}
  async scope(
    actor: TrustedActor,
    eventId: string,
    db: DatabaseExecutor,
    capability: EventCapability = "events.responses.manage",
  ) {
    const event = await this.events.detail(actor, eventId, db);
    this.events.requireCapability(event, capability);
    const { organizationId } = await this.authorization.approved(actor, db);
    return { organizationId, event };
  }
  async ready(
    actor: TrustedActor,
    eventId: string,
    db: DatabaseExecutor,
    capability: EventCapability = "events.responses.manage",
    sourceId?: string,
  ) {
    const scope = await this.scope(actor, eventId, db, capability);
    const { organizationId, event } = scope;
    if (event.archived || event.cancelled || !event.published)
      throw new DomainError(
        "SYNC_UNAVAILABLE",
        "Publish an active event before using guest reconciliation. History remains available.",
        409,
      );
    await this.modules.requireEnabled(
      organizationId,
      eventId,
      "registration",
      db,
    );
    const registration = await this.registrations.authoritySnapshot(
      organizationId,
      eventId,
      db,
    );
    const [link] = await db
      .select({
        url: lumaEventLink.publishedUrl,
        publishedAt: lumaEventLink.publishedAt,
      })
      .from(lumaEventLink)
      .where(
        and(
          eq(lumaEventLink.organizationId, organizationId),
          eq(lumaEventLink.eventId, eventId),
        ),
      );
    if (
      registration.authority !== "luma" ||
      !registration.open ||
      !link?.url ||
      !link.publishedAt
    )
      throw new DomainError(
        "SYNC_UNAVAILABLE",
        "Publish this event's Luma registration link before linking or reconciling API guests.",
        409,
      );
    const source = await new LumaSourceAccess().selection(
      organizationId,
      eventId,
      db,
      sourceId,
    );
    if (!source?.enabled)
      throw new DomainError(
        "SYNC_UNAVAILABLE",
        "Enable the selected booking source before importing its guests. Retained history remains available.",
        409,
      );
    return {
      ...scope,
      url: source.url,
      sourceId: source.id,
      sourceVersion: source.version,
      registrationVersion: registration.version,
    };
  }
  match(
    remote: { id: string; calendar_id: string; url: string },
    expected: { eventId: string; calendarId: string; url: string },
  ) {
    // Both URLs have already passed the shared HTTPS Luma event URL schema.
    if (
      remote.id !== expected.eventId ||
      remote.calendar_id !== expected.calendarId ||
      new URL(remote.url).pathname !== new URL(expected.url).pathname
    )
      throw new DomainError(
        "EVENT_MISMATCH",
        "The API event must belong to the checked calendar and match the selected booking source.",
        409,
      );
  }
}
