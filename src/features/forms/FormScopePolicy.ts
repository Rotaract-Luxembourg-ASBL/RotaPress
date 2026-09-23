import "server-only";
import { form } from "../../../db/schema/forms";
import {
  AuthorizationService,
  DomainError,
  type Capability,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { EventService } from "../events/EventService";
import { EventModuleService } from "../events/EventModuleService";
import { EventPublicAccess } from "../events/EventPublicAccess";
import { FormRepository } from "./FormRepository";

type Operation =
  | "read"
  | "edit"
  | "publish"
  | "settings"
  | "submissions.read"
  | "submissions.manage"
  | "submissions.export";
const globalPermission: Record<Operation, Capability> = {
  read: "forms.edit",
  edit: "forms.edit",
  publish: "forms.edit",
  settings: "forms.settings",
  "submissions.read": "submissions.read",
  "submissions.manage": "submissions.manage",
  "submissions.export": "submissions.export",
};
export class FormScopePolicy {
  readonly events: EventService;
  readonly modules: EventModuleService;
  readonly publicAccess: EventPublicAccess;
  private readonly forms: FormRepository;
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
  ) {
    this.events = new EventService(db, authorization);
    this.modules = new EventModuleService(db, this.events);
    this.publicAccess = new EventPublicAccess(db, this.events, this.modules);
    this.forms = new FormRepository(db);
  }

  async require(
    actor: TrustedActor,
    id: string,
    operation: Operation,
    executor: DatabaseExecutor = this.db,
  ) {
    const scope = await this.authorization.approved(actor, executor);
    await this.authorization.features.require(
      scope.organizationId,
      "forms",
      executor,
    );
    const current = await this.forms.owned(id, scope.organizationId, executor);
    if (!current.eventId)
      await this.authorization.require(
        actor,
        globalPermission[operation],
        executor,
      );
    else {
      const event = await this.events.detail(actor, current.eventId, executor);
      const capability = operation.startsWith("submissions.")
        ? "events.responses.manage"
        : operation === "read"
          ? null
          : operation === "edit"
            ? "events.edit"
            : "events.publish";
      if (capability) this.events.requireCapability(event, capability);
    }
    return { organizationId: scope.organizationId, current };
  }

  async lock(
    actor: TrustedActor,
    id: string,
    operation: Operation,
    tx: Transaction,
  ) {
    await this.forms.lockInstalled(tx);
    const scope = await this.require(actor, id, operation, tx);
    if (scope.current.eventId && !operation.startsWith("submissions.")) {
      const event = await this.events.detail(actor, scope.current.eventId, tx);
      this.events.requireActive(event);
      if (event.archived)
        throw new DomainError("EVENT_ARCHIVED", "This event is archived.", 409);
      await this.modules.requireEnabled(
        scope.organizationId,
        event.id,
        "forms",
        tx,
      );
    }
    return scope;
  }

  async dto(
    actor: TrustedActor,
    row: typeof form.$inferSelect,
    executor: DatabaseExecutor = this.db,
  ) {
    const result = await this.forms.dto(row, executor);
    if (!row.eventId) return result;
    const event = await this.events.detail(actor, row.eventId, executor);
    const states = await this.modules.states(
      row.organizationId,
      event.id,
      executor,
    );
    const active =
      !event.archived &&
      !event.cancelled &&
      states.some((s) => s.key === "forms" && s.state === "enabled") &&
      states.some((s) => s.key === "website" && s.state === "enabled");
    return {
      ...result,
      event: {
        id: event.id,
        title: event.title,
        canEdit: active && event.capabilities.includes("events.edit"),
        canPublish: active && event.capabilities.includes("events.publish"),
        canReadSubmissions: event.capabilities.includes(
          "events.responses.manage",
        ),
      },
    };
  }

  async publicForm(
    actor: TrustedActor | null,
    current: typeof form.$inferSelect,
    executor: DatabaseExecutor = this.db,
  ) {
    if (
      !(await this.authorization.features.enabled(
        current.organizationId,
        "forms",
        executor,
      ))
    )
      throw new DomainError("FORM_NOT_FOUND", "This form is unavailable.", 404);
    if (current.eventId)
      await this.publicAccess.require(
        actor,
        current.eventId,
        "forms",
        executor,
      );
  }
}
