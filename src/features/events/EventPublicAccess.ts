import "server-only";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { clubEvent } from "../../../db/schema/events";
import { installation } from "../../../db/schema/club";
import {
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { EventService } from "./EventService";
import { EventModuleService } from "./EventModuleService";
import { eventFieldsSchema } from "./event_schemas";
import type { EventModuleKey } from "./event_modules";

/** Shared public gate for event pages, forms and registration. */
export class EventPublicAccess {
  constructor(
    private readonly db: Database,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
  ) {}

  async require(
    actor: TrustedActor | null,
    id: string,
    key: EventModuleKey,
    executor: DatabaseExecutor = this.db,
  ) {
    const [row] = await executor
      .select({
        organizationId: clubEvent.organizationId,
        published: clubEvent.published,
        cancelledAt: clubEvent.cancelledAt,
      })
      .from(installation)
      .innerJoin(
        clubEvent,
        eq(clubEvent.organizationId, installation.organizationId),
      )
      .where(
        and(
          eq(installation.id, 1),
          eq(clubEvent.id, id),
          isNull(clubEvent.archivedAt),
          isNotNull(clubEvent.published),
        ),
      );
    const unavailable = () =>
      new DomainError("EVENT_NOT_FOUND", "This event is unavailable.", 404);
    if (!row) throw unavailable();
    if (row.cancelledAt && ["forms", "registration"].includes(key))
      throw unavailable();
    const event = eventFieldsSchema.parse(row.published);
    try {
      if (event.visibility === "private") {
        if (!actor) throw unavailable();
        await this.events.detail(actor, id, executor);
      }
      await this.modules.requireEnabled(row.organizationId, id, key, executor);
    } catch (error) {
      if (error instanceof DomainError) throw unavailable();
      throw error;
    }
    return {
      organizationId: row.organizationId,
      event,
      cancelled: row.cancelledAt !== null,
    };
  }
}
