import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { eventModule, clubEvent } from "../../../db/schema/events";
import { registrationSettings } from "../../../db/schema/registrations";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  DomainError,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { EventService } from "./EventService";
import { FeatureAvailability } from "../../core/features/FeatureAvailability";
import {
  eventModules,
  moduleChangeSchema,
  type EventModuleKey,
  type EventModuleState,
} from "./event_modules";
import type { EventModuleReadiness } from "./event_readiness";

export class EventModuleService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly events: EventService,
  ) {}

  /** Initializes only a new draft; the creation coordinator has reviewed activation. */
  async initializeDraft(
    organizationId: string,
    eventId: string,
    states: EventModuleState[],
    tx: Transaction,
  ) {
    const features = new FeatureAvailability(this.db);
    await features.require(organizationId, "events", tx);
    if (states.some((s) => s.key === "forms" && s.state === "enabled"))
      await features.require(organizationId, "forms", tx);
    const [event] = await tx
      .select()
      .from(clubEvent)
      .where(
        and(
          eq(clubEvent.id, eventId),
          eq(clubEvent.organizationId, organizationId),
        ),
      );
    const existing = await tx
      .select({ key: eventModule.key })
      .from(eventModule)
      .where(eq(eventModule.eventId, eventId));
    if (
      !event ||
      event.publishedAt ||
      event.archivedAt ||
      event.cancelledAt ||
      existing.length
    )
      throw new DomainError(
        "EVENT_INITIALIZED",
        "Initialize features only on a new event draft.",
        409,
      );
    const active = (key: EventModuleKey) =>
      states.some((s) => s.key === key && s.state === "enabled");
    if (
      states.some(
        (s) =>
          s.state === "enabled" &&
          !eventModules[s.key].dependencies.every(active),
      )
    )
      throw new DomainError(
        "EVENT_COPY_DEPENDENCIES",
        "The source has inconsistent feature dependencies. Review it before copying.",
        409,
      );
    if (states.length)
      await tx
        .insert(eventModule)
        .values(states.map((state) => ({ ...state, organizationId, eventId })));
  }

  async states(
    organizationId: string,
    eventId: string,
    executor: DatabaseExecutor = this.db,
  ): Promise<EventModuleState[]> {
    const rows = await executor
      .select({ key: eventModule.key, state: eventModule.state })
      .from(eventModule)
      .where(
        and(
          eq(eventModule.organizationId, organizationId),
          eq(eventModule.eventId, eventId),
        ),
      );
    return (Object.keys(eventModules) as EventModuleKey[]).map(
      (key) =>
        rows.find((row) => row.key === key) ?? { key, state: "disabled" },
    );
  }

  async requireEnabled(
    organizationId: string,
    eventId: string,
    key: EventModuleKey,
    executor: DatabaseExecutor = this.db,
  ) {
    const features = new FeatureAvailability(this.db);
    await features.require(organizationId, "events", executor);
    const dependencies = await this.dependencies(
      organizationId,
      eventId,
      executor,
    );
    if (key === "forms" || dependencies(key).includes("forms"))
      await features.require(organizationId, "forms", executor);
    const rows = await this.states(organizationId, eventId, executor);
    const active = (candidate: EventModuleKey) =>
      rows.some((row) => row.key === candidate && row.state === "enabled");
    if (!active(key) || !dependencies(key).every(active))
      throw new DomainError(
        "EVENT_MODULE_DISABLED",
        "Enable this event feature and its dependencies before editing or publishing content.",
        409,
      );
  }

  /** Internal scoped read: use the same dependencies as feature mutations/public gates. */
  async readiness(
    organizationId: string,
    eventId: string,
    executor: DatabaseExecutor = this.db,
  ): Promise<EventModuleReadiness[]> {
    const states = await this.states(organizationId, eventId, executor);
    const dependencies = await this.dependencies(
      organizationId,
      eventId,
      executor,
    );
    const features = await new FeatureAvailability(this.db).flags(
      organizationId,
      executor,
    );
    return states.map((module) => {
      const reasons: string[] = [];
      if (!features.events) reasons.push("Enable Events in club Integrations.");
      if (
        !features.forms &&
        (module.key === "forms" || dependencies(module.key).includes("forms"))
      )
        reasons.push("Enable Forms in club Integrations.");
      if (module.state !== "enabled")
        reasons.push(
          `${module.state === "suspended" ? "Re-enable" : "Enable"} ${eventModules[module.key].label} for this event.`,
        );
      for (const dependency of dependencies(module.key)) {
        if (
          !states.some(
            (item) => item.key === dependency && item.state === "enabled",
          )
        )
          reasons.push(
            `Enable ${eventModules[dependency].label} for this event.`,
          );
      }
      return { ...module, available: reasons.length === 0, reasons };
    });
  }

  /** Native registration needs Forms; external link mode uses Website only. */
  private async dependencies(
    organizationId: string,
    eventId: string,
    executor: DatabaseExecutor,
  ) {
    const [settings] = await executor
      .select({ authority: registrationSettings.authority })
      .from(registrationSettings)
      .where(
        and(
          eq(registrationSettings.organizationId, organizationId),
          eq(registrationSettings.eventId, eventId),
        ),
      );
    return (key: EventModuleKey): readonly EventModuleKey[] =>
      key === "registration" && settings?.authority === "native"
        ? ["website", "forms"]
        : eventModules[key].dependencies;
  }

  async change(actor: TrustedActor, input: unknown) {
    const parsed = moduleChangeSchema.parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.events.lockEvent(
        actor,
        parsed.id,
        tx,
      );
      this.events.requireCapability(event, "events.modules.manage");
      this.events.requireActive(event);
      this.events.requireEditableVersion(event, parsed.expectedVersion);
      const required = await this.dependencies(organizationId, event.id, tx);
      if (
        parsed.operation === "enable" &&
        (parsed.key === "forms" || required(parsed.key).includes("forms"))
      )
        await new FeatureAvailability(this.db).require(
          organizationId,
          "forms",
          tx,
        );
      const states = await this.states(organizationId, event.id, tx);
      const dependencies = await this.dependencies(
        organizationId,
        event.id,
        tx,
      );
      const active = (key: EventModuleKey) =>
        states.some((row) => row.key === key && row.state === "enabled");
      if (
        parsed.operation === "enable" &&
        !dependencies(parsed.key).every(active)
      )
        throw new DomainError(
          "EVENT_DEPENDENCY_REQUIRED",
          "Enable the required event features first.",
          409,
        );
      const dependents = states.filter(
        (row) =>
          row.state === "enabled" && dependencies(row.key).includes(parsed.key),
      );
      if (
        parsed.operation === "disable" &&
        dependents.length &&
        !parsed.suspendDependents
      )
        throw new DomainError(
          "EVENT_DEPENDENTS_ACTIVE",
          "Disabling this feature also suspends its active dependent features. Confirm this change explicitly.",
          409,
        );
      if (parsed.operation === "disable") {
        for (const dependent of dependents) {
          await tx
            .update(eventModule)
            .set({ state: "suspended", lastDisabledAt: sql`clock_timestamp()` })
            .where(
              and(
                eq(eventModule.eventId, event.id),
                eq(eventModule.key, dependent.key),
              ),
            );
        }
      }
      const state = parsed.operation === "enable" ? "enabled" : "disabled";
      const disabled =
        state === "disabled" ? { lastDisabledAt: sql`clock_timestamp()` } : {};
      await tx
        .insert(eventModule)
        .values({
          eventId: event.id,
          organizationId,
          key: parsed.key,
          state,
          ...disabled,
        })
        .onConflictDoUpdate({
          target: [eventModule.eventId, eventModule.key],
          set: {
            state,
            // Existing disabled rows can predate delivery history. Give those a
            // fence on reactivation instead of reviving their older queue.
            lastDisabledAt:
              state === "disabled"
                ? sql`clock_timestamp()`
                : sql`case
              when ${eventModule.state} <> 'enabled'
              then coalesce(${eventModule.lastDisabledAt}, clock_timestamp())
              else ${eventModule.lastDisabledAt} end`,
          },
        });
      await tx
        .update(clubEvent)
        .set({
          version: event.version + 1,
          updatedAt: new Date(),
          ...(parsed.key === "website" && parsed.operation === "disable"
            ? { featured: false }
            : {}),
        })
        .where(eq(clubEvent.id, event.id));
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: `event.module.${parsed.key}.${state}`,
        targetId: event.id,
      });
    });
    return this.events.detail(actor, parsed.id);
  }
}
