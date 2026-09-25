import { z } from "zod";
import type { Capability } from "@/core/authorization/AuthorizationService";

export const scopeDefinitions = {
  "website:read": { label: "Read website content", capability: "cms.edit" },
  "website:write": {
    label: "Create and edit website drafts",
    capability: "cms.edit",
  },
  "sources:read": {
    label: "Read approved reference websites",
    capability: "cms.edit",
  },
  "media:read": {
    label: "Read the club media catalogue",
    capability: "media.manage",
  },
  "forms:read": {
    label: "Read form definitions (no responses)",
    capability: "forms.edit",
  },
  "forms:write": {
    label: "Create and edit form drafts",
    capability: "forms.edit",
  },
  "events:read": {
    label: "Read event content (no guest records)",
    capability: "events.create",
  },
  "events:write": {
    label: "Create and edit event drafts",
    capability: "events.create",
  },
  "directory:read": {
    label: "Read directory profiles",
    capability: "cms.edit",
  },
  "directory:write": {
    label: "Create and edit directory drafts",
    capability: "cms.edit",
  },
  "calendar:read": {
    label: "Read calendar definitions",
    capability: "calendar.manage",
  },
} satisfies Record<string, { label: string; capability: Capability }>;
export type AutomationScope = keyof typeof scopeDefinitions;
export const automationScopeSchema = z.enum(
  Object.keys(scopeDefinitions) as [AutomationScope, ...AutomationScope[]],
);
export const connectionInput = z.strictObject({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(automationScopeSchema).min(1).max(11),
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
  sessionId: z.string().min(1),
  organizationId: z.uuid(),
  sourceOrigins: connectionInput.shape.sourceOrigins,
});
