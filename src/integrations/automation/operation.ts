import { z } from "zod";
import type { services } from "@/composition/services";
import type { AutomationPrincipal } from "./AutomationAccess";
import type { ContentImportService } from "./ContentImportService";
import type { ReferenceWebsiteClient } from "./ReferenceWebsiteClient";
import { scopeDefinitions, type AutomationScope } from "./scopes";
import { DomainError } from "@/core/DomainError";
import type { OperationEffect } from "./operation_effects";
import { ContentGeneration } from "@/core/content/ContentGeneration";

export type AutomationContext = {
  services: typeof services;
  principal: AutomationPrincipal;
  imports: ContentImportService;
  sources: ReferenceWebsiteClient;
  /** Recheck the connection after expensive work, before releasing private data. */
  reauthorize?: () => Promise<AutomationPrincipal>;
  recordActivity?: (
    operation: string,
    outcome: "succeeded" | "failed",
  ) => Promise<void>;
};
export async function reauthorizeContext(context: AutomationContext) {
  if (!context.reauthorize) return;
  const current = await context.reauthorize();
  if (
    current.organizationId !== context.principal.organizationId ||
    current.actor.userId !== context.principal.actor.userId ||
    current.keyId !== context.principal.keyId ||
    context.principal.scopes.some((scope) => !current.scopes.includes(scope))
  )
    throw new DomainError(
      "AUTOMATION_ACCESS_CHANGED",
      "This connection changed during the request. Reconnect and read current capabilities.",
      403,
    );
}
export type Operation = {
  name: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  description: string;
  effect: OperationEffect;
  scope: AutomationScope | null;
  /** Additional grants required together with the primary operation scope. */
  requiredScopes?: readonly AutomationScope[];
  readOnly: boolean;
  input: z.ZodType;
  output: z.ZodType;
  example: Record<string, unknown>;
  run: (context: AutomationContext, input: unknown) => Promise<unknown>;
};
export function operationScopes(
  operation: Pick<Operation, "scope" | "requiredScopes">,
): readonly AutomationScope[] {
  return [
    ...new Set([
      ...(operation.scope ? [operation.scope] : []),
      ...(operation.requiredScopes ?? []),
    ]),
  ];
}
export function operationAllowed(
  operation: Operation,
  scopes?: readonly string[],
) {
  return (
    !scopes ||
    operationScopes(operation).every((scope) => scopes.includes(scope))
  );
}
/** The same boundary protects direct catalogue calls and both transports. */
export async function authorizeOperation(
  context: AutomationContext,
  definition: Pick<Operation, "scope" | "requiredScopes">,
) {
  const required = operationScopes(definition);
  const missing = required.find(
    (scope) => !context.principal.scopes.includes(scope),
  );
  if (missing)
    throw new DomainError(
      "AUTOMATION_SCOPE_REQUIRED",
      `This connection needs ${missing}.`,
      403,
    );
  const current = await context.services.authorization.require(
    context.principal.actor,
    definition.scope
      ? scopeDefinitions[definition.scope].capability
      : "admin.access",
  );
  if (current.organizationId !== context.principal.organizationId)
    throw new DomainError(
      "AUTOMATION_ORGANIZATION_CHANGED",
      "Create a connection for the current club.",
      403,
    );
}
export function operation<I extends z.ZodType>(
  definition: Omit<Operation, "input" | "run" | "readOnly"> & {
    input: I;
    readOnly?: boolean;
  },
  run: (context: AutomationContext, input: z.output<I>) => Promise<unknown>,
): Operation {
  const readOnly = definition.readOnly ?? definition.method === "GET";
  const hasGeneration =
    definition.input instanceof z.ZodObject &&
    "expectedGeneration" in definition.input.shape;
  const inputSchema =
    !readOnly && definition.input instanceof z.ZodObject
      ? definition.input.safeExtend({ expectedGeneration: z.uuid().optional() })
      : definition.input;
  return {
    ...definition,
    input: inputSchema,
    readOnly,
    run: async (context, input) => {
      await authorizeOperation(context, definition);
      const parsedInput: unknown = inputSchema.parse(input);
      let domainInput = parsedInput;
      if (
        !readOnly &&
        parsedInput &&
        typeof parsedInput === "object" &&
        !Array.isArray(parsedInput)
      ) {
        const { expectedGeneration, ...rest } = parsedInput as Record<
          string,
          unknown
        >;
        await ContentGeneration.assertCurrent(
          context.principal.organizationId,
          typeof expectedGeneration === "string"
            ? expectedGeneration
            : undefined,
          context.services.automationRuntime.database,
        );
        if (!hasGeneration) domainInput = rest;
      }
      const value = await run(context, definition.input.parse(domainInput));
      const parsed = definition.output.safeParse(value);
      // Never expose unexpected service fields or internal schema diagnostics.
      if (!parsed.success)
        throw new DomainError(
          "AUTOMATION_RESPONSE_INVALID",
          "The response did not match the API contract.",
          500,
        );
      return parsed.data;
    },
  };
}
export const pagination = z.strictObject({
  offset: z.int().min(0).max(100000).default(0),
  limit: z.int().min(1).max(50).default(20),
});
export function page<T>(
  items: T[],
  { offset, limit }: z.infer<typeof pagination>,
) {
  return {
    items: items.slice(offset, offset + limit),
    ...pageMetadata(items.length, { offset, limit }),
  };
}
export function pageMetadata(
  total: number,
  { offset, limit }: z.infer<typeof pagination>,
) {
  return {
    total,
    offset,
    limit,
    nextOffset: offset + limit < total ? offset + limit : null,
  };
}
export function inputJsonSchema(input: z.ZodType) {
  return z.toJSONSchema(input, {
    io: "input",
    unrepresentable: "throw",
    reused: "ref",
  });
}
export function outputJsonSchema(output: z.ZodType) {
  return z.toJSONSchema(output, {
    io: "output",
    unrepresentable: "throw",
    reused: "ref",
  });
}
export function successSchema(output: z.ZodType) {
  return z.strictObject({ data: output });
}
