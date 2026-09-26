import { z } from "zod";
import type { services } from "@/composition/services";
import type { AutomationPrincipal } from "./AutomationAccess";
import type { ContentImportService } from "./ContentImportService";
import type { ReferenceWebsiteClient } from "./ReferenceWebsiteClient";
import type { AutomationScope } from "./scopes";
import { DomainError } from "@/core/DomainError";

export type AutomationContext = {
  services: typeof services;
  principal: AutomationPrincipal;
  imports: ContentImportService;
  sources: ReferenceWebsiteClient;
  /** Recheck the connection after expensive work, before releasing private data. */
  reauthorize?: () => Promise<AutomationPrincipal>;
};
export type Operation = {
  name: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  description: string;
  scope: AutomationScope | null;
  readOnly: boolean;
  input: z.ZodType;
  output: z.ZodType;
  example: Record<string, unknown>;
  run: (context: AutomationContext, input: unknown) => Promise<unknown>;
};
export function operation<I extends z.ZodType>(
  definition: Omit<Operation, "input" | "run" | "readOnly"> & {
    input: I;
    readOnly?: boolean;
  },
  run: (context: AutomationContext, input: z.output<I>) => Promise<unknown>,
): Operation {
  return {
    ...definition,
    readOnly: definition.readOnly ?? definition.method === "GET",
    run: async (context, input) => {
      const value = await run(context, definition.input.parse(input));
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
    nextOffset: offset + limit < items.length ? offset + limit : null,
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
