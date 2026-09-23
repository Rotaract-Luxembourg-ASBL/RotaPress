import "server-only";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { clubEvent } from "../../../db/schema/events";
import { eventRegistration } from "../../../db/schema/registrations";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { EventService } from "./EventService";
import { RegistrationService } from "./RegistrationService";
import { eventVersionSchema } from "./event_schemas";

const cancelSchema = eventVersionSchema.extend({
  expectedConfirmed: z.number().int().nonnegative(),
  confirmed: z.literal(true),
});
export class EventCancellationService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly events: EventService,
    private readonly registrations: RegistrationService,
  ) {}

  private async confirmed(
    eventId: string,
    organizationId: string,
    executor: DatabaseExecutor,
  ) {
    const [row] = await executor
      .select({ value: count() })
      .from(eventRegistration)
      .where(
        and(
          eq(eventRegistration.eventId, eventId),
          eq(eventRegistration.organizationId, organizationId),
          eq(eventRegistration.status, "confirmed"),
        ),
      );
    return row.value;
  }

  async preview(actor: TrustedActor, id: string) {
    const event = await this.events.detail(actor, id);
    this.events.requireCapability(event, "events.cancel");
    const { organizationId } = await this.authorization.approved(actor);
    return {
      expectedVersion: event.version,
      expectedConfirmed: await this.confirmed(id, organizationId, this.db),
      cancelled: event.cancelled,
      externalAuthority:
        (await this.registrations.authoritySnapshot(organizationId, id))
          .authority === "luma",
    };
  }

  async cancel(actor: TrustedActor, input: unknown) {
    const values = cancelSchema.parse(input);
    this.authorization.requireRecent(actor);
    return this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.events.lockEvent(
        actor,
        values.id,
        tx,
      );
      this.events.requireCapability(event, "events.cancel");
      if (event.cancelled) return event;
      this.events.requireEditableVersion(event, values.expectedVersion);
      if (
        (await this.confirmed(event.id, organizationId, tx)) !==
        values.expectedConfirmed
      )
        throw new DomainError(
          "CANCELLATION_REVIEW_CHANGED",
          "Registrations changed. Review the current cancellation impact again.",
          409,
        );
      const now = new Date();
      await tx
        .update(clubEvent)
        .set({
          cancelledAt: now,
          featured: false,
          version: event.version + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(clubEvent.id, event.id),
            eq(clubEvent.organizationId, organizationId),
          ),
        );
      await this.registrations.cancelEventRegistrations(
        organizationId,
        event.id,
        now,
        tx,
      );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "event.cancelled",
        targetId: event.id,
      });
      return this.events.detail(actor, event.id, tx);
    });
  }
}
