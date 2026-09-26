import { z } from "zod";
export const automationTransport = z.enum(["rest", "mcp"]);
export type AutomationTransport = z.infer<typeof automationTransport>;
export type AutomationAvailabilityState = {
  kind: AutomationTransport;
  enabled: boolean;
  version: number;
};
export const availabilityChange = z.strictObject({
  kind: automationTransport,
  enabled: z.boolean(),
  expectedVersion: z.int().nonnegative(),
  confirmed: z.literal(true),
});
export const transportDescriptions = {
  rest: {
    name: "REST API",
    description:
      "Connect scripts and applications with documented, scoped HTTP operations.",
    href: "/admin/integrations/automation/docs",
    settingsLabel: "API documentation & tester",
  },
  mcp: {
    name: "MCP",
    description:
      "Add RotaPress to an AI client's MCP apps or plugins to prepare and review content.",
    href: "/admin/integrations/automation",
    settingsLabel: "Manage AI & API",
  },
} as const;
