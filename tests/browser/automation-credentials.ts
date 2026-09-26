import { expect, type Page } from "@playwright/test";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import type { AutomationScope } from "../../src/integrations/automation/scopes";

export async function issueTransportPair(
  owner: Page,
  input: { name: string; scopes: AutomationScope[] },
) {
  async function issue(transport: "rest" | "mcp") {
    const response = await owner.request.post(
      "/api/admin/integrations/automation",
      {
        headers: { origin: smokeOrigin },
        data: { ...input, transport },
      },
    );
    expect(response.status()).toBe(200);
    return (await response.json()) as { id: string; key: string };
  }
  const rest = await issue("rest");
  const mcp = await issue("mcp");
  return { rest, mcp };
}
