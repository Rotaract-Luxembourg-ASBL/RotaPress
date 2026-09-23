import "server-only";
import { FeatureAvailability } from "../../core/features/FeatureAvailability";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { lumaReconciliationJob as jobs } from "../../../db/schema/luma-jobs";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  DomainError,
  type DatabaseExecutor,
  type ResolveScheduledActor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { EventService } from "../../features/events/EventService";
import { LumaConnectionAccess } from "./LumaConnectionAccess";
import { LumaEventSyncAccess } from "./LumaEventSyncAccess";
import { LumaSyncRepository } from "./LumaSyncRepository";
import type { SyncExecution } from "./LumaGuestSyncService";
import { syncRequestSchema } from "./sync_schemas";
import {
  cancelReconciliationSchema,
  reconciliationMessages,
  type ReconciliationJobDto,
} from "./job_schemas";

/** One explicitly requested import per source, tied to reviewed settings and a real session. */
export class LumaReconciliationJobs {
  private readonly records = new LumaSyncRepository();
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly events: EventService,
    private readonly access: LumaEventSyncAccess,
    private readonly connection: LumaConnectionAccess,
    private readonly resolveActor: ResolveScheduledActor,
  ) {}

  async identity(sessionId: string, userId: string) {
    const current = await this.resolveActor(sessionId, userId);
    if (
      !current ||
      current.expiresAt.getTime() <= Date.now() ||
      current.actor.sessionId !== sessionId ||
      current.actor.userId !== userId
    )
      throw new DomainError(
        "SYNC_ACCESS_CHANGED",
        "The requesting session is no longer available.",
        401,
      );
    return current.actor;
  }

  async history(
    actor: TrustedActor,
    eventId: string,
    sourceId?: string,
  ): Promise<ReconciliationJobDto[]> {
    z.uuid().parse(eventId);
    const { organizationId } = await this.access.scope(actor, eventId, this.db);
    const link = await this.records.link(
      organizationId,
      eventId,
      this.db,
      sourceId,
    );
    if (!link) return [];
    const rows = await this.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.organizationId, organizationId),
          eq(jobs.eventId, eventId),
          eq(jobs.sourceId, link.sourceId),
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(10);
    return rows.map((row) => ({
      id: row.id,
      sourceId: row.sourceId,
      status: row.status,
      attempts: row.attempts,
      createdAt: row.createdAt.toISOString(),
      availableAt: row.availableAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      message: row.errorCode
        ? (reconciliationMessages[row.errorCode] ??
          reconciliationMessages.PROVIDER_REJECTED)
        : null,
    }));
  }

  async enqueue(actor: TrustedActor, eventId: string, input: unknown) {
    z.uuid().parse(eventId);
    const values = syncRequestSchema.parse(input);
    actor = await this.identity(actor.sessionId, actor.userId);
    const sourceId = await this.db.transaction(async (tx) => {
      await this.events.lockEvent(actor, eventId, tx);
      const { organizationId } = await this.access.scope(actor, eventId, tx);
      const link = await this.records.link(
        organizationId,
        eventId,
        tx,
        values.sourceId,
      );
      const [replay] = await tx
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.organizationId, organizationId),
            eq(jobs.requestId, values.requestId),
          ),
        );
      if (replay) {
        if (
          replay.eventId !== eventId ||
          replay.sourceId !== link?.sourceId ||
          replay.requestedBy !== actor.userId ||
          replay.requestedVersion !== values.expectedVersion
        )
          throw new DomainError(
            "SYNC_REQUEST_CONFLICT",
            "This request already identifies another reconciliation.",
            409,
          );
        return replay.sourceId;
      }
      if (!link?.enabled || link.version !== values.expectedVersion)
        throw new DomainError(
          "API_LINK_CHANGED",
          "Reload the enabled event link before requesting reconciliation.",
          409,
        );
      const scope = await this.access.ready(
        actor,
        eventId,
        tx,
        "events.responses.manage",
        link.sourceId,
      );
      const [active] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.eventId, eventId),
            eq(jobs.organizationId, organizationId),
            eq(jobs.sourceId, link.sourceId),
            inArray(jobs.status, ["pending", "processing"]),
          ),
        );
      if (active)
        throw new DomainError(
          "SYNC_ALREADY_QUEUED",
          "This source already has a reconciliation queued or in progress.",
          409,
        );
      const connection = await this.connection.capture(organizationId, tx);
      if (connection.id !== link.connectionId)
        throw new DomainError(
          "CONNECTION_CHANGED",
          "The checked connection changed.",
          409,
        );
      const dueAt = new Date(
        Math.max(Date.now(), (link.attemptedAt?.getTime() ?? 0) + 65_000),
      );
      await tx.insert(jobs).values({
        organizationId,
        eventId,
        sourceId: link.sourceId,
        sourceVersion: scope.sourceVersion,
        connectionId: connection.id,
        connectionVersion: connection.version,
        eventVersion: scope.event.version,
        registrationVersion: scope.registrationVersion,
        requestedVersion: link.version,
        linkVersion: link.version,
        requestId: values.requestId,
        requestedBy: actor.userId,
        sessionId: actor.sessionId,
        dueAt,
        availableAt: dueAt,
      });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "integration.luma.reconciliation_queued",
        targetId: eventId,
      });
      return link.sourceId;
    });
    return this.history(actor, eventId, sourceId);
  }

  async cancel(actor: TrustedActor, eventId: string, input: unknown) {
    z.uuid().parse(eventId);
    const values = cancelReconciliationSchema.parse(input);
    const sourceId = await this.db.transaction(async (tx) => {
      await this.events.lockEvent(actor, eventId, tx);
      const { organizationId } = await this.access.scope(actor, eventId, tx);
      const link = await this.records.link(
        organizationId,
        eventId,
        tx,
        values.sourceId,
      );
      if (!link)
        throw new DomainError(
          "SYNC_JOB_CHANGED",
          "Choose the source for this reconciliation.",
          409,
        );
      const cancelled = await tx
        .update(jobs)
        .set({
          status: "cancelled",
          finishedAt: new Date(),
          errorCode: "CANCELLED",
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(
          and(
            eq(jobs.id, values.id),
            eq(jobs.eventId, eventId),
            eq(jobs.organizationId, organizationId),
            eq(jobs.sourceId, link.sourceId),
            inArray(jobs.status, ["pending", "processing"]),
          ),
        )
        .returning({ id: jobs.id });
      if (!cancelled.length)
        throw new DomainError(
          "SYNC_JOB_CHANGED",
          "This reconciliation is no longer active. Refresh its status.",
          409,
        );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "integration.luma.reconciliation_cancelled",
        targetId: eventId,
      });
      return link.sourceId;
    });
    return this.history(actor, eventId, sourceId);
  }

  /** Worker-only contract. Rechecked before fetching pages and under the event write lock. */
  execution(id: string, lease: string): SyncExecution {
    const current = async (db: DatabaseExecutor) => {
      const [job] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, id))
        .for("update");
      if (
        !job ||
        job.status !== "processing" ||
        job.leaseToken !== lease ||
        job.leaseExpiresAt!.getTime() <= Date.now()
      )
        throw new DomainError(
          "SYNC_LEASE_CHANGED",
          "This reconciliation is no longer current.",
          409,
        );
      const actor = await this.identity(job.sessionId, job.requestedBy);
      await new FeatureAvailability(this.db).requireQueuedWork(
        job.organizationId,
        "events",
        job.createdAt,
        db,
      );
      const scope = await this.access.ready(
        actor,
        job.eventId,
        db,
        "events.responses.manage",
        job.sourceId,
      );
      const link = await this.records.link(
        scope.organizationId,
        job.eventId,
        db,
        job.sourceId,
      );
      if (
        scope.organizationId !== job.organizationId ||
        scope.event.version !== job.eventVersion ||
        scope.registrationVersion !== job.registrationVersion ||
        scope.sourceId !== job.sourceId ||
        scope.sourceVersion !== job.sourceVersion ||
        !link?.enabled ||
        link.version !== job.linkVersion
      )
        throw new DomainError(
          "SYNC_CONFIGURATION_CHANGED",
          "The reviewed event configuration changed.",
          409,
        );
      await this.connection.assertCurrent(
        job.organizationId,
        job.connectionId,
        job.connectionVersion,
        db,
      );
    };
    return {
      guard: current,
      started: async (linkVersion, tx) => {
        await tx
          .update(jobs)
          .set({ linkVersion })
          .where(and(eq(jobs.id, id), eq(jobs.leaseToken, lease)));
      },
      complete: async (tx) => {
        // Projection and completion commit together. A lost worker acknowledgement cannot import twice.
        await current(tx);
        await tx
          .update(jobs)
          .set({
            status: "succeeded",
            finishedAt: new Date(),
            errorCode: null,
            leaseToken: null,
            leaseExpiresAt: null,
          })
          .where(eq(jobs.id, id));
      },
    };
  }
}
