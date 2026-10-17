import "server-only";
import { randomUUID } from "node:crypto";
import { EventRevisionWriter } from "./EventRevisionWriter";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { organization } from "../../../db/schema/club";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { EventRepository } from "./EventRepository";
import { eventCollectionSchema } from "./event_collection";
import {
  createEventSchema,
  eventVersionSchema,
  saveEventSchema,
  eventManagerChangeSchema,
  eventEditorChangeSchema,
  eventRoleCapabilities,
  type EventCapability,
  type EventDraft,
} from "./event_schemas";

/** Current event scope and draft operations. Publication has a separate projection. */
export class EventService {
  private readonly repository: EventRepository;
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
  ) {
    this.repository = new EventRepository(db);
  }

  async hasAccess(actor: TrustedActor | null) {
    if (!actor) return false;
    try {
      const scope = await this.authorization.approved(actor);
      await this.authorization.features.require(scope.organizationId, "events");
      return (
        scope.capabilities.includes("events.manage") ||
        (await this.repository.hasAssignment(
          scope.organizationId,
          actor.userId,
        ))
      );
    } catch (error) {
      if (error instanceof DomainError) return false;
      throw error;
    }
  }

  async query(actor: TrustedActor, input: unknown = {}) {
    const scope = await this.authorization.approved(actor);
    await this.authorization.features.require(scope.organizationId, "events");
    const manager = scope.capabilities.includes("events.manage");
    if (
      !manager &&
      !(await this.repository.hasAssignment(scope.organizationId, actor.userId))
    )
      throw new DomainError(
        "EVENT_ACCESS_DENIED",
        "You need an event team role to use event administration.",
      );
    const result = await this.repository.query(
      scope.organizationId,
      eventCollectionSchema.parse(input),
      manager ? undefined : actor.userId,
    );
    return {
      ...result,
      events: result.events.map((event) => ({
        ...event,
        canArchive: manager || event.manager?.userId === actor.userId,
      })),
    };
  }

  async responseEventIds(
    actor: TrustedActor,
    executor: DatabaseExecutor = this.db,
  ): Promise<string[]> {
    const scope = await this.authorization.approved(actor, executor);
    await this.authorization.features.require(
      scope.organizationId,
      "events",
      executor,
    );
    const rows = await this.repository.responseEventIds(
      scope.organizationId,
      scope.capabilities.includes("events.manage") ? undefined : actor.userId,
      executor,
    );
    return rows.flatMap((row) =>
      typeof row === "string"
        ? [row]
        : eventRoleCapabilities[row.role].includes("events.responses.manage")
          ? [row.id]
          : [],
    );
  }

  async hasResponseAccess(actor: TrustedActor | null): Promise<boolean> {
    if (!actor) return false;
    try {
      return (await this.responseEventIds(actor)).length > 0;
    } catch (error) {
      if (error instanceof DomainError) return false;
      throw error;
    }
  }

  async managers(actor: TrustedActor) {
    const scope = await this.authorization.require(actor, "events.create");
    return (await this.repository.managers(scope.organizationId)).map(
      (person) => ({ ...person, isCurrent: person.userId === actor.userId }),
    );
  }

  async detail(
    actor: TrustedActor,
    rawId: unknown,
    executor: DatabaseExecutor = this.db,
  ) {
    const id = z.uuid().parse(rawId);
    const scope = await this.authorization.approved(actor, executor);
    await this.authorization.features.require(
      scope.organizationId,
      "events",
      executor,
    );
    const event = await this.repository.detail(
      id,
      scope.organizationId,
      executor,
    );
    const role = await this.repository.role(
      id,
      scope.organizationId,
      actor.userId,
      executor,
    );
    if (!event || (!scope.capabilities.includes("events.manage") && !role)) {
      throw new DomainError(
        "EVENT_NOT_FOUND",
        "This event is unavailable.",
        404,
      );
    }
    return {
      ...event,
      capabilities:
        eventRoleCapabilities[
          scope.capabilities.includes("events.manage") ? "manager" : role!
        ],
    };
  }

  async team(actor: TrustedActor, id: string) {
    const event = await this.detail(actor, id);
    const { organizationId } = await this.authorization.approved(actor);
    return {
      members: await this.repository.team(id, organizationId),
      candidates:
        !event.archived && event.capabilities.includes("events.team.manage")
          ? await this.repository.managers(organizationId)
          : [],
    };
  }

  async changeEditor(
    actor: TrustedActor,
    input: unknown,
    executor?: Transaction,
  ) {
    this.authorization.requireRecent(actor);
    const {
      id,
      expectedVersion,
      userId,
      operation,
      role: requestedRole,
    } = eventEditorChangeSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const { organizationId, event } = await this.lockEvent(actor, id, tx);
      this.requireCapability(event, "events.team.manage");
      this.requireEditableVersion(event, expectedVersion);
      const role = await this.repository.role(id, organizationId, userId, tx);
      if (role === "manager")
        throw new DomainError(
          "EVENT_MANAGER_PROTECTED",
          "Use the reviewed manager-change action to replace the responsible manager.",
          409,
        );
      if (
        operation === "grant" &&
        !(await this.repository.approvedManager(organizationId, userId, tx))
      ) {
        throw new DomainError(
          "EVENT_EDITOR_INVALID",
          "Choose a currently approved club member as editor.",
          422,
        );
      }
      if (
        (operation === "grant" && role === requestedRole) ||
        (operation === "revoke" && !role)
      )
        return event;
      if (role && role !== requestedRole)
        throw new DomainError(
          "EVENT_ROLE_CONFLICT",
          "Remove the current assignment before granting another role.",
          409,
        );
      await this.repository.changeEditor(
        id,
        organizationId,
        userId,
        operation,
        tx,
        requestedRole,
      );
      await this.repository.update(
        id,
        organizationId,
        { version: event.version + 1 },
        tx,
      );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action:
          operation === "grant"
            ? `event.${requestedRole}_granted`
            : `event.${requestedRole}_revoked`,
        targetId: id,
      });
      return this.detail(actor, id, tx);
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }

  async create(actor: TrustedActor, input: unknown, executor?: Transaction) {
    const apply = (tx: Transaction) => this.createDraft(actor, input, tx);
    const id = executor
      ? await apply(executor)
      : await this.db.transaction(apply);
    return this.detail(actor, id, executor ?? this.db);
  }

  /** Composes template initialization in the same transaction as event creation. */
  async createDraft(actor: TrustedActor, input: unknown, tx: Transaction) {
    const { managerUserId, ...fields } = createEventSchema.parse(input);
    const scope = await this.authorization.lock(actor, "events.create", tx);
    if (
      !(await this.repository.approvedManager(
        scope.organizationId,
        managerUserId,
        tx,
      ))
    ) {
      throw new DomainError(
        "EVENT_MANAGER_INVALID",
        "Choose a currently approved club member as manager.",
        422,
      );
    }
    const id = await this.repository.insert(
      {
        ...fields,
        slug: `${
          fields.title
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 100)
            .replace(/-$/, "") || "event"
        }-${randomUUID().slice(0, 8)}`,
        startsAt: new Date(fields.startsAt),
        endsAt: fields.endsAt ? new Date(fields.endsAt) : null,
        organizationId: scope.organizationId,
        createdBy: actor.userId,
      },
      managerUserId,
      tx,
    );
    await this.audit.record(tx, {
      organizationId: scope.organizationId,
      actorUserId: actor.userId,
      action: "event.draft_created",
      targetId: id,
    });
    await new EventRevisionWriter().append(
      tx,
      actor,
      scope.organizationId,
      await this.detail(actor, id, tx),
      "created",
    );
    return id;
  }

  async save(actor: TrustedActor, input: unknown, executor?: Transaction) {
    const { id, expectedVersion, ...fields } = saveEventSchema.parse(input);
    return this.mutate(
      actor,
      id,
      expectedVersion,
      "event.draft_saved",
      {
        ...fields,
        startsAt: new Date(fields.startsAt),
        endsAt: fields.endsAt ? new Date(fields.endsAt) : null,
      },
      executor,
    );
  }

  async archive(actor: TrustedActor, input: unknown, executor?: Transaction) {
    this.authorization.requireRecent(actor);
    const { id, expectedVersion } = eventVersionSchema.parse(input);
    return this.mutate(
      actor,
      id,
      expectedVersion,
      "event.archived",
      {
        archivedAt: new Date(),
        featured: false,
      },
      executor,
    );
  }

  async reassignManager(
    actor: TrustedActor,
    input: unknown,
    executor?: Transaction,
  ) {
    this.authorization.requireRecent(actor);
    const { id, expectedVersion, managerUserId } =
      eventManagerChangeSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "events.manage",
        tx,
      );
      const event = await this.detail(actor, id, tx);
      this.requireEditableVersion(event, expectedVersion);
      if (
        !(await this.repository.approvedManager(
          organizationId,
          managerUserId,
          tx,
        ))
      ) {
        throw new DomainError(
          "EVENT_MANAGER_INVALID",
          "Choose a currently approved club member as manager.",
          422,
        );
      }
      if (event.manager?.userId === managerUserId) return event;
      await this.repository.assignManager(
        id,
        organizationId,
        managerUserId,
        tx,
      );
      await this.repository.update(
        id,
        organizationId,
        { version: event.version + 1 },
        tx,
      );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "event.manager_changed",
        targetId: id,
      });
      return this.detail(actor, id, tx);
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }

  requireEditableVersion(event: EventDraft, expectedVersion: number) {
    if (event.archived)
      throw new DomainError(
        "EVENT_ARCHIVED",
        "Archived event drafts are read-only.",
        409,
      );
    if (event.version !== expectedVersion)
      throw new DomainError(
        "EVENT_CONFLICT",
        "Someone saved a newer event version. Your entered changes are preserved; reload before trying again.",
        409,
      );
  }

  requireActive(event: EventDraft) {
    if (event.cancelled)
      throw new DomainError(
        "EVENT_CANCELLED",
        "This event is cancelled. Its content and records are retained.",
        409,
      );
  }

  requireCapability(event: EventDraft, capability: EventCapability) {
    if (!event.capabilities.includes(capability))
      throw new DomainError(
        "EVENT_ACCESS_DENIED",
        "Your current event assignment does not permit this operation.",
      );
  }

  async lockEvent(actor: TrustedActor, id: string, tx: Transaction) {
    const initial = await this.authorization.approved(actor, tx);
    // Serialize assignments with membership changes, then reload current authority.
    await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, initial.organizationId))
      .for("update");
    return {
      organizationId: initial.organizationId,
      event: await this.detail(actor, id, tx),
    };
  }

  private async mutate(
    actor: TrustedActor,
    id: string,
    expectedVersion: number,
    action: string,
    values: Parameters<EventRepository["update"]>[2],
    executor?: Transaction,
  ) {
    const apply = async (tx: Transaction) => {
      const { organizationId, event } = await this.lockEvent(actor, id, tx);
      this.requireCapability(
        event,
        action === "event.archived" ? "events.archive" : "events.edit",
      );
      this.requireEditableVersion(event, expectedVersion);
      if (action !== "event.archived") this.requireActive(event);
      await this.repository.update(
        id,
        organizationId,
        { ...values, version: event.version + 1 },
        tx,
      );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action,
        targetId: id,
      });
      if (action === "event.draft_saved")
        await new EventRevisionWriter().append(
          tx,
          actor,
          organizationId,
          await this.detail(actor, id, tx),
          "saved",
        );
      return this.detail(actor, id, tx);
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }
}
