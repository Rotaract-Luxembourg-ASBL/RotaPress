import { z } from "zod";
import {
  formCreateSchema,
  formSaveSchema,
} from "@/features/forms/form_schemas";
import type { FormDto } from "@/features/forms/form_types";
import { operation, pagination, pageMetadata } from "./operation";
import { formOutput, pageOutput } from "./response_schemas";
import { exampleId, formExample } from "./examples";
import { receiptOperation } from "./receipt_operation";
import { FormScopePolicy } from "@/features/forms/FormScopePolicy";
const idInput = z.strictObject({ id: z.uuid() });
export const formContent = (f: FormDto) => ({
  id: f.id,
  kind: f.kind,
  archived: f.archived,
  draftRevision: f.draftRevision,
  draft: f.draft,
  publishedVersionId: f.publishedVersionId,
});
export const formContentOperations = [
  operation(
    {
      name: "forms_list",
      effect: "read",
      output: pageOutput(formOutput),
      example: { limit: 20, offset: 0 },
      method: "GET",
      path: "/forms",
      scope: "forms:read",
      description:
        "List form definitions. Excludes submissions, response counts, recipients and webhooks.",
      input: pagination.extend({ eventId: z.uuid().optional() }),
    },
    async ({ services: s, principal: p }, { limit, offset, eventId }) => {
      const result = await s.forms.collection.list(
        p.actor,
        { pageSize: limit, offset, status: "all" },
        eventId,
      );
      return {
        items: result.forms.map(formContent),
        ...pageMetadata(result.total, { offset, limit }),
      };
    },
  ),
  operation(
    {
      name: "forms_get",
      effect: "read",
      output: formOutput,
      example: { id: exampleId },
      method: "GET",
      path: "/forms/{id}",
      scope: "forms:read",
      description: "Read a form draft and revision number, without responses.",
      input: idInput,
    },
    async ({ services: s, principal: p }, i) =>
      formContent(await s.forms.detail(p.actor, i.id)),
  ),
  receiptOperation(
    {
      name: "forms_create",
      effect: "draft",
      output: formOutput,
      example: { kind: "contact", title: "Contact our club" },
      method: "POST",
      path: "/forms",
      scope: "forms:write",
      description:
        "Create a private contact or membership form draft. Publishing requires the separate forms:publish grant and an explicit user request.",
      input: formCreateSchema,
    },
    ({ services: s, principal: p }, _i, tx) =>
      s.authorization.require(p.actor, "forms.edit", tx),
    async ({ services: s, principal: p }, i, tx) =>
      formContent(await s.forms.createDraft(p.actor, i, tx)),
  ),
  receiptOperation(
    {
      name: "forms_save",
      effect: "draft",
      output: formOutput,
      example: { id: exampleId, expectedRevision: 1, definition: formExample },
      method: "PATCH",
      path: "/forms/{id}",
      scope: "forms:write",
      description:
        "Save a form draft using its current expectedRevision; no notification or publication changes.",
      input: z.strictObject({ id: z.uuid(), ...formSaveSchema.shape }),
    },
    ({ services: s, principal: p }, { id }, tx) =>
      new FormScopePolicy(
        s.automationRuntime.database,
        s.authorization,
      ).require(p.actor, id, "edit", tx),
    async ({ services: s, principal: p }, { id, ...i }, tx) =>
      formContent(await s.forms.save(p.actor, id, i, tx)),
  ),
];
