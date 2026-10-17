import { z } from "zod";
import { formPublishSchema } from "@/features/forms/form_schemas";
import { receiptOperation } from "./receipt_operation";
import { FormScopePolicy } from "@/features/forms/FormScopePolicy";
import { exampleId } from "./examples";
import { publicationConfirmation as confirmed } from "./publication_policy";
export const formPublicationOperations = [
  receiptOperation(
    {
      name: "forms_publish",
      effect: "publish",
      method: "POST",
      path: "/forms/{id}/publish",
      scope: "forms:publish",
      description:
        "Publish the exact saved form revision only when the user asks, with confirmed:true and expectedRevision from forms_get. The current form/event publisher permissions still apply. Does not read responses, change recipients, activate registration or publish its page.",
      input: formPublishSchema.extend({ id: z.uuid(), confirmed }),
      output: z.strictObject({
        id: z.uuid(),
        draftRevision: z.int().positive(),
        publishedVersionId: z.uuid(),
        reviewUrl: z.string(),
      }),
      example: { id: exampleId, expectedRevision: 1, confirmed: true },
    },
    ({ services: s, principal: p }, { id }, tx) =>
      new FormScopePolicy(
        s.automationRuntime.database,
        s.authorization,
      ).require(p.actor, id, "publish", tx),
    async (context, { id, expectedRevision }, tx) => {
      const form = await context.services.forms.publish(
        context.principal.actor,
        id,
        { expectedRevision },
        tx,
      );
      return {
        id: form.id,
        draftRevision: form.draftRevision,
        publishedVersionId: form.publishedVersionId,
        reviewUrl: `/admin/forms/${form.id}`,
      };
    },
  ),
];
