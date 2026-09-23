import "server-only";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { form, formSubmission, formVersion } from "../../../db/schema/forms";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { FormRepository } from "./FormRepository";
import { FormScopePolicy } from "./FormScopePolicy";
import { formDefinitionSchema } from "./form_schemas";
import type { FormDeletionReview } from "./form_types";

const deletionSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  expectedResponses: z.number().int().nonnegative(),
  confirmed: z.literal(true),
});

/** Erase an archived form as one transaction; booking history is retained. */
export class FormDeletionService {
  private readonly scope: FormScopePolicy;
  private readonly repository: FormRepository;
  private readonly audit = new AuditRepository();

  constructor(
    private readonly db: Database,
    authorization: AuthorizationService,
  ) {
    this.scope = new FormScopePolicy(db, authorization);
    this.repository = new FormRepository(db);
  }

  async review(actor: TrustedActor, id: string): Promise<FormDeletionReview> {
    z.uuid().parse(id);
    return this.db.transaction(async (tx) => {
      await this.repository.lockInstalled(tx);
      return this.reviewWith(actor, id, tx);
    });
  }

  async delete(actor: TrustedActor, id: string, input: unknown): Promise<void> {
    z.uuid().parse(id);
    const values = deletionSchema.parse(input);
    await this.db.transaction(async (tx) => {
      await this.repository.lockInstalled(tx);
      const review = await this.reviewWith(actor, id, tx);
      if (review.blockedReason)
        throw new DomainError("FORM_DELETE_BLOCKED", review.blockedReason, 409);
      if (
        review.revision !== values.expectedRevision ||
        review.responses !== values.expectedResponses
      )
        throw new DomainError(
          "FORM_DELETE_CHANGED",
          "This form or its responses changed. Close this window and review deletion again.",
          409,
        );
      const organizationId = await this.repository.installedOrganization(tx);
      // Responses own their notification and webhook delivery records. Delete
      // those before the form so immutable versions can cascade with the parent.
      await tx
        .delete(formSubmission)
        .where(
          and(
            eq(formSubmission.formId, id),
            eq(formSubmission.organizationId, organizationId),
          ),
        );
      await tx
        .delete(form)
        .where(and(eq(form.id, id), eq(form.organizationId, organizationId)));
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "form.deleted",
        targetId: id,
      });
    });
  }

  private async reviewWith(
    actor: TrustedActor,
    id: string,
    executor: DatabaseExecutor,
  ): Promise<FormDeletionReview> {
    const { current, organizationId } = await this.scope.require(
      actor,
      id,
      "publish",
      executor,
    );
    await this.scope.require(actor, id, "submissions.manage", executor);
    const [responses] = await executor
      .select({ total: count() })
      .from(formSubmission)
      .where(
        and(
          eq(formSubmission.formId, id),
          eq(formSubmission.organizationId, organizationId),
        ),
      );
    const [versions] = await executor
      .select({ total: count() })
      .from(formVersion)
      .where(
        and(
          eq(formVersion.formId, id),
          eq(formVersion.organizationId, organizationId),
        ),
      );
    return {
      id,
      title: formDefinitionSchema.parse(current.draft).title,
      revision: current.draftRevision,
      responses: responses.total,
      versions: versions.total,
      blockedReason: !current.archived
        ? "Archive this form before permanently deleting it."
        : current.kind === "registration"
          ? "Registration forms are kept with event booking history. Keep this form archived to stop new bookings."
          : null,
    };
  }
}
