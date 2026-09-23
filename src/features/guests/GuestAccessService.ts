import "server-only";
import { z } from "zod";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  DomainError,
  requireRecentActor,
  requireVerifiedActor,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { EventService } from "../events/EventService";
import type { EventModuleService } from "../events/EventModuleService";
import type { RegistrationService } from "../events/RegistrationService";
import type { LumaGuestAccessSource } from "../../integrations/luma/LumaGuestAccessSource";
import type { GuestSource } from "../events/guest_sources";
import { eventFieldsSchema } from "../events/event_schemas";
import { GuestGrantRepository, type GuestGrant } from "./GuestGrantRepository";
import {
  claimGuestSchema,
  grantGuestSchema,
  revokeGuestSchema,
  type GuestInvitation,
  type GuestPortal,
  type GuestWorkspace,
} from "./guest_schemas";

/** Guest identity never creates staff membership or supplies event authority. */
export class GuestAccessService {
  private readonly repository = new GuestGrantRepository();
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
    private readonly registrations: RegistrationService,
    private readonly luma: LumaGuestAccessSource,
  ) {}

  async workspace(
    actor: TrustedActor,
    rawEventId: unknown,
  ): Promise<GuestWorkspace> {
    const eventId = z.uuid().parse(rawEventId);
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.staff(actor, eventId, tx);
      const native = await this.registrations.guestSources(
        organizationId,
        eventId,
        tx,
      );
      const external = await this.luma.guestSources(
        organizationId,
        eventId,
        tx,
      );
      const grants = await this.repository.list(tx, organizationId, eventId);
      const modules = await this.modules.states(organizationId, eventId, tx);
      const event = await this.repository.event(tx, organizationId, eventId);
      const sources = [...native.slice(0, 200), ...external.slice(0, 200)];
      const history: GuestWorkspace["grants"] = [];
      for (const row of grants.slice(0, 200)) {
        const source =
          sources.find(
            (s) => s.id === this.sourceId(row) && s.kind === this.kind(row),
          ) ?? (await this.source(tx, row));
        history.push({
          id: row.id,
          sourceId: source?.sourceId,
          sourceLabel: source?.sourceLabel,
          name: source?.name ?? "Guest",
          email: row.recipientEmail,
          source: this.kind(row),
          status: row.revokedAt
            ? "revoked"
            : row.claimedBy
              ? "claimed"
              : "invited",
          available: this.matches(row, source),
          version: row.version,
        });
      }
      return {
        modules,
        published: Boolean(event?.publishedAt),
        candidates: sources
          .filter(
            (source) =>
              source.available &&
              z.email().safeParse(source.email).success &&
              !grants.some(
                (row) =>
                  !row.revokedAt &&
                  this.sourceId(row) === source.id &&
                  this.kind(row) === source.kind,
              ),
          )
          .map((source) => ({
            source: source.kind,
            id: source.id,
            sourceId: source.sourceId,
            sourceLabel: source.sourceLabel,
            name: source.name,
            email: source.email,
            status: source.status,
          })),
        grants: history,
        limited:
          native.length > 200 || external.length > 200 || grants.length > 200,
      };
    });
  }

  async grant(actor: TrustedActor, rawEventId: unknown, input: unknown) {
    requireRecentActor(actor);
    const eventId = z.uuid().parse(rawEventId);
    const value = grantGuestSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.staff(actor, eventId, tx);
      this.events.requireEditableVersion(event, event.version);
      this.events.requireActive(event);
      await this.published(tx, organizationId, eventId);
      const [source] = await this.sources(
        tx,
        organizationId,
        eventId,
        value.source,
        value.sourceId,
      );
      if (!source?.available || !z.email().safeParse(source.email).success)
        throw new DomainError(
          "GUEST_SOURCE_UNAVAILABLE",
          "Choose a current confirmed registration or present Luma guest with an email address.",
          409,
        );
      const existing = await this.repository.activeSource(
        tx,
        organizationId,
        eventId,
        value.source,
        value.sourceId,
      );
      if (existing) {
        if (!this.matches(existing, source))
          throw new DomainError(
            "GUEST_SOURCE_CHANGED",
            "Revoke the old invitation before granting access to changed guest details.",
            409,
          );
        return { id: existing.id };
      }
      const row = await this.repository.insert(tx, {
        organizationId,
        eventId,
        registrationId: source.kind === "native" ? source.id : null,
        registrationUserId: source.userId,
        lumaGuestId: source.kind === "luma" ? source.id : null,
        recipientEmail: source.email.trim().toLowerCase(),
        createdBy: actor.userId,
      });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "guest.access_granted",
        targetId: row.id,
      });
      return { id: row.id };
    });
  }

  async revoke(
    actor: TrustedActor,
    rawEventId: unknown,
    rawId: unknown,
    input: unknown,
  ) {
    requireRecentActor(actor);
    const eventId = z.uuid().parse(rawEventId),
      id = z.uuid().parse(rawId);
    const value = revokeGuestSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.staff(actor, eventId, tx);
      const row = await this.repository.get(tx, organizationId, eventId, id);
      if (!row) throw this.unavailable();
      if (row.revokedAt) return { id: row.id };
      if (row.version !== value.expectedVersion)
        throw new DomainError(
          "GUEST_CONFLICT",
          "Guest access changed. Refresh before revoking it.",
          409,
        );
      await this.repository.update(tx, row, { revokedAt: new Date() });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "guest.access_revoked",
        targetId: row.id,
      });
      return { id: row.id };
    });
  }

  async mine(actor: TrustedActor): Promise<GuestInvitation[]> {
    requireVerifiedActor(actor);
    return this.db.transaction(async (tx) => {
      const organizationId = await this.repository.installed(tx);
      const rows = await this.repository.mine(tx, organizationId, actor);
      const invitations: GuestInvitation[] = [];
      for (const row of rows) {
        try {
          const { event } = await this.access(
            tx,
            organizationId,
            row.eventId,
            row.id,
            actor,
          );
          invitations.push({
            id: row.id,
            eventId: row.eventId,
            title: event.title,
            startsAt: event.startsAt,
            timezone: event.timezone,
            claimed: row.claimedBy === actor.userId,
          });
        } catch (error) {
          if (!(
            error instanceof DomainError && error.code === "GUEST_UNAVAILABLE"
          ))
            throw error;
        }
      }
      return invitations;
    });
  }

  async claim(
    actor: TrustedActor,
    rawEventId: unknown,
    rawId: unknown,
    input: unknown,
  ) {
    requireVerifiedActor(actor);
    claimGuestSchema.parse(input);
    const eventId = z.uuid().parse(rawEventId),
      id = z.uuid().parse(rawId);
    return this.db.transaction(async (tx) => {
      const organizationId = await this.repository.installed(tx, true);
      const { row } = await this.access(tx, organizationId, eventId, id, actor);
      if (!row.claimedBy) {
        await this.repository.update(tx, row, {
          claimedBy: actor.userId,
          claimedAt: new Date(),
        });
        await this.audit.record(tx, {
          organizationId,
          actorUserId: actor.userId,
          action: "guest.access_claimed",
          targetId: id,
        });
      }
      return { id, eventId };
    });
  }

  async portal(
    actor: TrustedActor,
    rawEventId: unknown,
    rawId: unknown,
  ): Promise<GuestPortal> {
    requireVerifiedActor(actor);
    const eventId = z.uuid().parse(rawEventId),
      id = z.uuid().parse(rawId);
    return this.db.transaction(async (tx) => {
      const organizationId = await this.repository.installed(tx);
      const { row, event, source } = await this.access(
        tx,
        organizationId,
        eventId,
        id,
        actor,
      );
      if (row.claimedBy !== actor.userId) throw this.unavailable();
      return {
        id,
        eventId,
        event,
        booking: {
          source: source.kind,
          status: source.status,
          observedAt: source.observedAt,
        },
      };
    });
  }

  /** Internal purchase reads reuse the claimed grant under the same transaction. */
  async purchaseScope(
    actor: TrustedActor,
    eventId: string,
    id: string,
    tx: Transaction,
  ) {
    requireVerifiedActor(actor);
    const organizationId = await this.repository.installed(tx);
    const result = await this.access(tx, organizationId, eventId, id, actor);
    if (result.row.claimedBy !== actor.userId || !result.row.lumaGuestId)
      throw this.unavailable();
    return { ...result, organizationId, guestId: result.row.lumaGuestId };
  }

  private async staff(actor: TrustedActor, eventId: string, tx: Transaction) {
    const scope = await this.events.lockEvent(actor, eventId, tx);
    this.events.requireCapability(scope.event, "events.guests.manage");
    return scope;
  }

  private async published(
    db: DatabaseExecutor,
    organizationId: string,
    eventId: string,
  ) {
    const row = await this.repository.event(db, organizationId, eventId);
    if (!row?.publishedAt || row.archivedAt || row.cancelledAt)
      throw this.unavailable();
    const fields = eventFieldsSchema.safeParse(row.published);
    if (!fields.success) throw this.unavailable();
    try {
      await this.modules.requireEnabled(organizationId, eventId, "portal", db);
    } catch (error) {
      if (
        error instanceof DomainError &&
        ["EVENT_MODULE_DISABLED", "FEATURE_DISABLED"].includes(error.code)
      )
        throw this.unavailable();
      throw error;
    }
    return fields.data;
  }

  private async access(
    db: DatabaseExecutor,
    organizationId: string,
    eventId: string,
    id: string,
    actor: TrustedActor,
  ) {
    const row = await this.repository.get(db, organizationId, eventId, id);
    if (
      !row ||
      row.revokedAt ||
      row.recipientEmail !== actor.email.trim().toLowerCase() ||
      (row.claimedBy && row.claimedBy !== actor.userId) ||
      (row.registrationUserId && row.registrationUserId !== actor.userId)
    )
      throw this.unavailable();
    const source = await this.source(db, row);
    if (!source || !this.matches(row, source)) throw this.unavailable();
    const event = await this.published(db, organizationId, eventId);
    return { row, source, event };
  }
  private sourceId(row: GuestGrant) {
    return row.registrationId ?? row.lumaGuestId!;
  }
  private kind(row: GuestGrant): "native" | "luma" {
    return row.registrationId ? "native" : "luma";
  }
  private sources(
    db: DatabaseExecutor,
    organizationId: string,
    eventId: string,
    kind: "native" | "luma",
    id: string,
  ): Promise<GuestSource[]> {
    return kind === "native"
      ? this.registrations.guestSources(organizationId, eventId, db, id)
      : this.luma.guestSources(organizationId, eventId, db, id);
  }
  private async source(db: DatabaseExecutor, row: GuestGrant) {
    return (
      await this.sources(
        db,
        row.organizationId,
        row.eventId,
        this.kind(row),
        this.sourceId(row),
      )
    )[0];
  }
  private matches(row: GuestGrant, source?: GuestSource) {
    return Boolean(
      source?.available &&
      source.email.trim().toLowerCase() === row.recipientEmail &&
      source.userId === row.registrationUserId,
    );
  }
  private unavailable() {
    return new DomainError(
      "GUEST_UNAVAILABLE",
      "This guest invitation is unavailable. Contact the event team if you need access.",
      404,
    );
  }
}
