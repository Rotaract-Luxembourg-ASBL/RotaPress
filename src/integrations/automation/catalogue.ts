import { DomainError } from "@/core/authorization/AuthorizationService";
import { websiteOperations } from "./website_operations";
import { featureOperations } from "./feature_operations";
import { mediaOperations } from "./media_operations";
import { previewOperations } from "./preview_operations";
import { eventOperations } from "./event_operations";
import { workflowOperations } from "./workflow_operations";
import { designOperations } from "./design_operations";
import { scopeDefinitions } from "./scopes";
import { z } from "zod";
import { capabilitiesOutput } from "./response_schemas";
import { adaptationPrompt, promptInput } from "./prompts";
import {
  inputJsonSchema,
  outputJsonSchema,
  successSchema,
  operation,
  type AutomationContext,
  type Operation,
} from "./operation";

export const operations: readonly Operation[] = [
  operation(
    {
      name: "automation_capabilities",
      method: "GET",
      path: "/capabilities",
      scope: null,
      description:
        "Discover this connection's operations, approved source origins and enabled features before editing. Publication always requires human review.",
      input: z.strictObject({}),
      output: capabilitiesOutput,
      example: {},
    },
    capabilities,
  ),
  operation(
    {
      name: "automation_prompt",
      method: "POST",
      path: "/prompts/adapt_reference_website",
      scope: null,
      description:
        "Get the reference-content adaptation instructions. This only returns a prompt; it does not fetch a source, run a model or change content.",
      input: promptInput,
      output: z.strictObject({ prompt: z.string() }),
      example: {
        sourceUrl: "https://www.rotary.org/",
        locale: "en",
        brief: "Prepare About and Contact pages using verified club facts.",
      },
      readOnly: true,
    },
    async (_context, input) => ({ prompt: adaptationPrompt(input) }),
  ),
  ...websiteOperations,
  ...featureOperations,
  ...mediaOperations,
  ...previewOperations,
  ...eventOperations,
  ...workflowOperations,
  ...designOperations,
];
export const contractVersion = "1.3.0";
export function operationCatalogue(scopes?: readonly string[]) {
  return operations
    .filter((o) => !o.scope || !scopes || scopes.includes(o.scope))
    .map((o) => ({
      name: o.name,
      method: o.method,
      path: `/api/v1${o.path}`,
      scope: o.scope,
      description: o.description,
      readOnly: o.readOnly,
      inputSchema: inputJsonSchema(o.input),
      outputSchema: outputJsonSchema(successSchema(o.output)),
      example: o.example,
    }));
}
export async function capabilities(context: AutomationContext) {
  const features = await context.services.authorization.features.states(
    context.principal.organizationId,
  );
  return {
    version: contractVersion,
    publication: "manual-only" as const,
    sourceOrigins: context.principal.sourceOrigins,
    features: features.map(({ key, enabled, version }) => ({
      key,
      enabled,
      version,
    })),
    operations: operations
      .filter((o) => !o.scope || context.principal.scopes.includes(o.scope))
      .map((o) => ({
        name: o.name,
        method: o.method,
        path: `/api/v1${o.path}`,
        scope: o.scope,
        description: o.description,
        readOnly: o.readOnly,
      })),
  };
}
export async function executeOperation(
  context: AutomationContext,
  name: string,
  input: unknown,
) {
  const operation = operations.find((o) => o.name === name);
  if (!operation)
    throw new DomainError(
      "OPERATION_NOT_FOUND",
      "This operation is unavailable.",
      404,
    );
  if (operation.scope && !context.principal.scopes.includes(operation.scope))
    throw new DomainError(
      "AUTOMATION_SCOPE_REQUIRED",
      `This connection needs ${operation.scope}.`,
      403,
    );
  const current = await context.services.authorization.require(
    context.principal.actor,
    operation.scope
      ? scopeDefinitions[operation.scope].capability
      : "admin.access",
  );
  if (current.organizationId !== context.principal.organizationId)
    throw new DomainError(
      "AUTOMATION_ORGANIZATION_CHANGED",
      "Create a connection for the current club.",
      403,
    );
  return operation.run(context, input);
}
