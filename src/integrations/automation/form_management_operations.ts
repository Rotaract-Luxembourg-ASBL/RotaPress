import { createHash } from "node:crypto";
import { z } from "zod";
import { DomainError } from "@/core/DomainError";
import { FormScopePolicy } from "@/features/forms/FormScopePolicy";
import {
  formArchiveSchema,
  formSettingsSchema,
} from "@/features/forms/form_schemas";
import { operation, type AutomationContext } from "./operation";
import {
  canonicalJson,
  executeReceipt,
  receiptFields,
} from "./receipt_service";
import { exampleId } from "./examples";

const settings = z.strictObject({
  settings: z.strictObject({
    recipients: z.array(z.email()).max(10),
    retentionDays: z.int().min(1).max(36500).nullable(),
  }),
  fingerprint: z.string().length(64),
});
const archive = z.strictObject({
  id: z.uuid(),
  archived: z.boolean(),
  draftRevision: z.int().positive(),
});
const deleted = z.strictObject({ deletedId: z.uuid() });
const fingerprint = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
const policy = (context: AutomationContext) =>
  new FormScopePolicy(
    context.services.automationRuntime.database,
    context.services.authorization,
  );

export const formManagementOperations = [
  operation(
    {
      name: "forms_settings_get",
      method: "GET",
      path: "/forms/{id}/settings",
      scope: "forms:settings",
      effect: "read",
      description:
        "Read the authorized form's notification recipients and retention policy with an exact fingerprint. Recipient addresses are private operational information.",
      input: z.strictObject({ id: z.uuid() }),
      output: settings,
      example: { id: exampleId },
    },
    async ({ services, principal }, { id }) => {
      const value = await services.forms.settings(principal.actor, id);
      return { settings: value, fingerprint: fingerprint(value) };
    },
  ),
  operation(
    {
      name: "forms_settings_set",
      method: "POST",
      path: "/forms/{id}/settings",
      scope: "forms:settings",
      effect: "update",
      description:
        "Apply the explicitly requested recipients and retention policy using the current settings fingerprint. Future notification destinations change immediately; existing alerts and retained booking responses keep their native rules.",
      input: z.strictObject({
        id: z.uuid(),
        settings: formSettingsSchema,
        expectedFingerprint: z.string().length(64),
        ...receiptFields,
      }),
      output: settings,
      example: {
        id: exampleId,
        settings: { recipients: [], retentionDays: null },
        expectedFingerprint: "0".repeat(64),
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "forms_settings_set",
        input,
        settings,
        async (tx) => {
          context.services.authorization.requireRecent(context.principal.actor);
          await policy(context).require(
            context.principal.actor,
            input.id,
            "settings",
            tx,
          );
        },
        async (tx) => {
          const { current } = await policy(context).lock(
            context.principal.actor,
            input.id,
            "settings",
            tx,
          );
          const previous = formSettingsSchema.parse({
            recipients: current.recipients,
            retentionDays: current.retentionDays,
          });
          if (fingerprint(previous) !== input.expectedFingerprint)
            throw new DomainError(
              "FORM_SETTINGS_CHANGED",
              "Read the current form settings before applying this change.",
              409,
            );
          const value = await context.services.forms.updateSettings(
            context.principal.actor,
            input.id,
            input.settings,
            tx,
          );
          return { settings: value, fingerprint: fingerprint(value) };
        },
      ),
  ),
  operation(
    {
      name: "forms_archive",
      method: "POST",
      path: "/forms/{id}/archive",
      scope: "forms:manage",
      effect: "archive",
      description:
        "Archive or restore exactly the requested form at its current revision. Archiving stops responses; restoration leaves the form unpublished until an explicit publication request.",
      input: formArchiveSchema.extend({ id: z.uuid(), ...receiptFields }),
      output: archive,
      example: {
        id: exampleId,
        archived: true,
        expectedRevision: 1,
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "forms_archive",
        input,
        archive,
        (tx) =>
          policy(context).require(
            context.principal.actor,
            input.id,
            "publish",
            tx,
          ),
        async (tx) => {
          const value = await context.services.forms.archive(
            context.principal.actor,
            input.id,
            {
              expectedRevision: input.expectedRevision,
              archived: input.archived,
            },
            tx,
          );
          return {
            id: value.id,
            archived: value.archived,
            draftRevision: value.draftRevision,
          };
        },
      ),
  ),
  operation(
    {
      name: "forms_deletion_preview",
      method: "GET",
      path: "/forms/{id}/deletion",
      scope: "forms:delete",
      requiredScopes: ["responses:delete"],
      effect: "read",
      description:
        "Inspect current revision, response count and deletion blockers for a requested archived form. Registration forms cannot be erased. This inspection is not an extra approval gate.",
      input: z.strictObject({ id: z.uuid() }),
      output: z.strictObject({
        id: z.uuid(),
        title: z.string(),
        revision: z.int().positive(),
        responses: z.int().nonnegative(),
        versions: z.int().nonnegative(),
        blockedReason: z.string().nullable(),
      }),
      example: { id: exampleId },
    },
    ({ services, principal }, { id }) =>
      services.formDeletion.review(principal.actor, id),
  ),
  operation(
    {
      name: "forms_delete",
      method: "POST",
      path: "/forms/{id}/delete",
      scope: "forms:delete",
      requiredScopes: ["responses:delete"],
      effect: "delete",
      description:
        "Permanently erase the specifically requested archived form, its responses and delivery records when revision/count still match. Requires both explicit deletion grants and current global form/response authority; retained booking history is protected.",
      input: z.strictObject({
        id: z.uuid(),
        expectedRevision: z.int().positive(),
        expectedResponses: z.int().nonnegative(),
        confirmed: z.literal(true),
        ...receiptFields,
      }),
      output: deleted,
      example: {
        id: exampleId,
        expectedRevision: 1,
        expectedResponses: 0,
        confirmed: true,
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "forms_delete",
        input,
        deleted,
        async (tx) => {
          context.services.authorization.requireRecent(context.principal.actor);
          await context.services.authorization.require(
            context.principal.actor,
            "forms.settings",
            tx,
          );
          await context.services.authorization.require(
            context.principal.actor,
            "submissions.manage",
            tx,
          );
        },
        async (tx) => {
          await context.services.formDeletion.delete(
            context.principal.actor,
            input.id,
            {
              expectedRevision: input.expectedRevision,
              expectedResponses: input.expectedResponses,
              confirmed: true,
            },
            tx,
          );
          return { deletedId: input.id };
        },
      ),
  ),
];
