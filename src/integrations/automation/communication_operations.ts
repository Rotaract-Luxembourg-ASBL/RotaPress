import { z } from "zod";
import { DomainError } from "@/core/DomainError";
import {
  emailTemplateSchema,
  templateKeySchema,
  templateSaveSchema,
  templatePublishSchema,
} from "@/integrations/email/email_schemas";
import { FormScopePolicy } from "@/features/forms/FormScopePolicy";
import { SubmissionRepository } from "@/features/forms/SubmissionRepository";
import { operation } from "./operation";
import { executeReceipt, receiptFields } from "./receipt_service";
import { exampleId } from "./examples";

const template = z.strictObject({
  key: templateKeySchema,
  version: z.int().nonnegative(),
  draft: emailTemplateSchema,
  published: emailTemplateSchema.nullable(),
});
const queued = z.strictObject({
  submissionId: z.uuid(),
  retryRequested: z.literal(true),
});
export const communicationOperations = [
  operation(
    {
      name: "communications_templates",
      method: "GET",
      path: "/communications/templates",
      scope: "communications:templates",
      effect: "read",
      description:
        "Read built-in email template drafts and publication versions. Sending credentials, server settings and private recipients are excluded.",
      input: z.strictObject({}),
      output: z.strictObject({ items: z.array(template) }),
      example: {},
    },
    async ({ services, principal }) => ({
      items: (await services.email.workspace(principal.actor)).templates,
    }),
  ),
  operation(
    {
      name: "communications_template_save",
      method: "POST",
      path: "/communications/templates/{key}/draft",
      scope: "communications:templates",
      effect: "draft",
      description:
        "Save the requested built-in email template draft at its exact current version. Does not send messages or change the active template.",
      input: templateSaveSchema.extend(receiptFields),
      output: template,
      example: {
        key: "form_submission",
        expectedVersion: 0,
        requestId: exampleId,
        draft: {
          subject: "New response",
          heading: "New response",
          body: "A response is ready to review.",
          buttonLabel: "Review",
          accent: "#a83b28",
        },
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "communications_template_save",
        input,
        template,
        (tx) =>
          context.services.authorization.require(
            context.principal.actor,
            "integrations.manage",
            tx,
          ),
        async (tx) =>
          (
            await context.services.email.saveTemplate(
              context.principal.actor,
              {
                key: input.key,
                expectedVersion: input.expectedVersion,
                draft: input.draft,
              },
              tx,
            )
          ).templates.find((entry) => entry.key === input.key),
      ),
  ),
  operation(
    {
      name: "communications_template_publish",
      method: "POST",
      path: "/communications/templates/{key}/publish",
      scope: "communications:publish",
      effect: "publish",
      description:
        "Activate the specifically requested saved email template version for future native notifications. Does not send a message now or configure a sender/provider.",
      input: templatePublishSchema.extend({
        ...receiptFields,
        confirmed: z.literal(true),
      }),
      output: template,
      example: {
        key: "form_submission",
        expectedVersion: 1,
        requestId: exampleId,
        confirmed: true,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "communications_template_publish",
        input,
        template,
        async (tx) => {
          context.services.authorization.requireRecent(context.principal.actor);
          await context.services.authorization.require(
            context.principal.actor,
            "integrations.manage",
            tx,
          );
        },
        async (tx) =>
          (
            await context.services.email.publishTemplate(
              context.principal.actor,
              { key: input.key, expectedVersion: input.expectedVersion },
              tx,
            )
          ).templates.find((entry) => entry.key === input.key),
      ),
  ),
  operation(
    {
      name: "communications_retry_response_alert",
      method: "POST",
      path: "/responses/{id}/retry-alert",
      scope: "communications:send",
      effect: "communicate",
      description:
        "Retry only failed native notification deliveries for the explicitly requested response. Keeps the existing approved recipients and template; cannot send arbitrary mail or campaigns. The receipt confirms the retry request was processed, not that any delivery was queued or sent.",
      input: z.strictObject({
        id: z.uuid(),
        formId: z.uuid(),
        expectedVersion: z.int().positive(),
        ...receiptFields,
      }),
      output: queued,
      example: {
        id: exampleId,
        formId: exampleId,
        expectedVersion: 1,
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "communications_retry_response_alert",
        input,
        queued,
        async (tx) => {
          context.services.authorization.requireRecent(context.principal.actor);
          await new FormScopePolicy(
            context.services.automationRuntime.database,
            context.services.authorization,
          ).require(
            context.principal.actor,
            input.formId,
            "submissions.manage",
            tx,
          );
        },
        async (tx) => {
          const row = await new SubmissionRepository(
            context.services.automationRuntime.database,
          ).owned(input.id, context.principal.organizationId, tx);
          if (
            row.formId !== input.formId ||
            row.version !== input.expectedVersion
          )
            throw new DomainError(
              "SUBMISSION_CHANGED",
              "Read the current response before retrying its failed alerts.",
              409,
            );
          await context.services.submissions.retryNotification(
            context.principal.actor,
            input.id,
            tx,
          );
          return { submissionId: input.id, retryRequested: true };
        },
      ),
  ),
];
