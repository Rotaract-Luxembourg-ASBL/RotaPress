import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { automationProposal } from "../../../db/schema/automation-review";
import type { Database } from "@/infrastructure/database/client";
import {
  DomainError,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import type { services } from "@/composition/services";
import type { AutomationPrincipal } from "./AutomationAccess";
import { AuditRepository } from "@/core/audit/AuditRepository";
import {
  proposalInput,
  proposalPayload,
  type ProposalDto,
} from "./proposal_schemas";

type Dependencies = Pick<
  typeof services,
  "authorization" | "events" | "registrations" | "eventModules"
>;
type Row = typeof automationProposal.$inferSelect;

/** Fixed event settings only: never a generic executable approval/job system. */
export class AutomationProposalService {
  constructor(
    private readonly db: Database,
    private readonly dependencies: Dependencies,
  ) {}

  private dto(row: Row, eventTitle: string): ProposalDto {
    return {
      id: row.id,
      eventId: row.eventId,
      eventTitle,
      proposal: proposalPayload.parse(row.payload),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewUrl: `/admin/integrations/automation/review?eventId=${row.eventId}`,
    };
  }

  async create(principal: AutomationPrincipal, input: unknown) {
    if (!principal.scopes.includes("events:prepare"))
      throw new DomainError(
        "AUTOMATION_SCOPE_REQUIRED",
        "This connection needs events:prepare.",
        403,
      );
    const parsed = proposalInput.parse(input);
    const inputHash = createHash("sha256")
      .update(JSON.stringify(parsed))
      .digest("hex");
    return this.db.transaction(async (tx) => {
      const access = await this.dependencies.authorization.lock(
        principal.actor,
        "events.create",
        tx,
      );
      if (access.organizationId !== principal.organizationId)
        throw new DomainError(
          "AUTOMATION_ORGANIZATION_CHANGED",
          "Create a connection for the current club.",
          403,
        );
      const event = await this.dependencies.events.detail(
        principal.actor,
        parsed.eventId,
        tx,
      );
      this.dependencies.events.requireCapability(event, "events.edit");
      this.dependencies.events.requireActive(event);
      const [existing] = await tx
        .select()
        .from(automationProposal)
        .where(
          and(
            eq(automationProposal.organizationId, access.organizationId),
            eq(automationProposal.createdBy, principal.actor.userId),
            eq(automationProposal.requestId, parsed.requestId),
          ),
        );
      if (existing) {
        if (existing.inputHash !== inputHash)
          throw new DomainError(
            "AUTOMATION_PROPOSAL_CONFLICT",
            "This request was already used for different settings.",
            409,
          );
        return this.dto(existing, event.title);
      }
      const pending = await tx
        .select({ id: automationProposal.id })
        .from(automationProposal)
        .where(
          and(
            eq(automationProposal.organizationId, access.organizationId),
            eq(automationProposal.createdBy, principal.actor.userId),
            eq(automationProposal.status, "pending"),
          ),
        )
        .limit(50);
      if (pending.length >= 50)
        throw new DomainError(
          "AUTOMATION_PROPOSAL_LIMIT",
          "Review pending suggestions before preparing more.",
          409,
        );
      const [row] = await tx
        .insert(automationProposal)
        .values({
          organizationId: access.organizationId,
          eventId: event.id,
          createdBy: principal.actor.userId,
          requestId: parsed.requestId,
          inputHash,
          kind: parsed.proposal.kind,
          payload: parsed.proposal,
        })
        .returning();
      await new AuditRepository().record(tx, {
        organizationId: access.organizationId,
        actorUserId: principal.actor.userId,
        action: "automation.proposal.created",
        targetId: row.id,
      });
      return this.dto(row, event.title);
    });
  }

  async list(actor: TrustedActor, eventId: string) {
    z.uuid().parse(eventId);
    const access = await this.dependencies.authorization.require(
      actor,
      "events.create",
    );
    const event = await this.dependencies.events.detail(actor, eventId);
    this.dependencies.events.requireCapability(event, "events.edit");
    const rows = await this.db
      .select()
      .from(automationProposal)
      .where(
        and(
          eq(automationProposal.organizationId, access.organizationId),
          eq(automationProposal.eventId, eventId),
        ),
      )
      .orderBy(desc(automationProposal.createdAt))
      .limit(100);
    return rows.map((row) => this.dto(row, event.title));
  }

  /** Called only by cookie-authenticated administration, never registered as a tool. */
  async review(actor: TrustedActor, input: unknown) {
    const values = z
      .strictObject({
        id: z.uuid(),
        action: z.enum(["apply", "reject"]),
        confirmed: z.literal(true),
      })
      .parse(input);
    return this.db.transaction(async (tx) => {
      const access = await this.dependencies.authorization.lock(
        actor,
        "integrations.manage",
        tx,
      );
      this.dependencies.authorization.requireRecent(actor);
      const [row] = await tx
        .select()
        .from(automationProposal)
        .where(
          and(
            eq(automationProposal.id, values.id),
            eq(automationProposal.organizationId, access.organizationId),
          ),
        )
        .for("update");
      if (!row)
        throw new DomainError(
          "NOT_FOUND",
          "This suggestion is unavailable.",
          404,
        );
      const event = await this.dependencies.events.detail(
        actor,
        row.eventId,
        tx,
      );
      this.dependencies.events.requireCapability(
        event,
        "events.modules.manage",
      );
      if (row.status !== "pending") {
        if (row.status !== (values.action === "apply" ? "applied" : "rejected"))
          throw new DomainError(
            "AUTOMATION_PROPOSAL_REVIEWED",
            "This suggestion was already reviewed.",
            409,
          );
        return this.dto(row, event.title);
      }
      const proposal = proposalPayload.parse(row.payload);
      if (values.action === "apply") {
        if (proposal.kind === "registration")
          await this.dependencies.registrations.configure(
            actor,
            row.eventId,
            { ...proposal.settings, confirmed: true },
            tx,
          );
        else
          await this.dependencies.eventModules.change(
            actor,
            { ...proposal.settings, id: row.eventId, confirmed: true },
            tx,
          );
      }
      const [updated] = await tx
        .update(automationProposal)
        .set({
          status: values.action === "apply" ? "applied" : "rejected",
          reviewedBy: actor.userId,
          reviewedAt: new Date(),
        })
        .where(eq(automationProposal.id, row.id))
        .returning();
      await new AuditRepository().record(tx, {
        organizationId: access.organizationId,
        actorUserId: actor.userId,
        action: `automation.proposal.${updated.status}`,
        targetId: row.id,
      });
      return this.dto(updated, event.title);
    });
  }
}
