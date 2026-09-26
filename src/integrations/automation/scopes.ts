import { z } from "zod";
import { automationTransport } from "./availability_schemas";
import {
  scopeDefinitions,
  type AutomationScope,
} from "@/core/authorization/automation_scopes";
export {
  scopeDefinitions,
  type AutomationScope,
} from "@/core/authorization/automation_scopes";

export const automationScopeSchema = z.enum(
  Object.keys(scopeDefinitions) as [AutomationScope, ...AutomationScope[]],
);
export const connectionInput = z.strictObject({
  transport: automationTransport.default("rest"),
  name: z.string().trim().min(2).max(80),
  scopes: z
    .array(automationScopeSchema)
    .min(1)
    .max(Object.keys(scopeDefinitions).length),
  expiresIn: z.int().min(300).max(28800).default(3600),
  sourceOrigins: z
    .array(
      z
        .url()
        .max(250)
        .refine((value) => {
          try {
            const url = new URL(value);
            return (
              url.protocol === "https:" &&
              value === url.origin &&
              !url.username &&
              !url.password &&
              (!url.port || url.port === "443")
            );
          } catch {
            return false;
          }
        }, "Use an HTTPS website origin without a path, such as https://www.example.org."),
    )
    .max(5)
    .default([]),
});
export const connectionMetadata = z.strictObject({
  purpose: z.literal("rotapress-automation-v1"),
  // Previously shared keys retain REST access only. MCP requires its own grant.
  transport: automationTransport.default("rest"),
  sessionId: z.string().min(1),
  organizationId: z.uuid(),
  sourceOrigins: connectionInput.shape.sourceOrigins,
});
