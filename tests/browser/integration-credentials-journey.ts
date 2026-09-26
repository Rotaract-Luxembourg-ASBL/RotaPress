import { expect, type Page } from "@playwright/test";

const endpoint = "/api/admin/integrations/automation";
type Issued = { id: string; key: string };

/** Visible, separate credential flows with a real owner session; no secret is logged. */
export async function integrationCredentialsJourney(owner: Page) {
  await owner.goto("/admin/integrations");
  await owner
    .getByRole("link", {
      name: "API tokens, docs & tester REST API",
      exact: true,
    })
    .click();
  await expect(
    owner.getByRole("heading", { name: "REST API", exact: true }),
  ).toBeVisible();
  await expect(
    owner.getByRole("heading", { name: "Connect with OAuth" }),
  ).toHaveCount(0);
  const scopes = owner.getByRole("group", {
    name: "Allowed actions",
    exact: true,
  });
  await scopes.getByRole("button", { name: "Select all", exact: true }).click();
  expect(await scopes.getByRole("checkbox", { checked: true }).count()).toBe(
    await scopes.getByRole("checkbox").count(),
  );
  await scopes.getByRole("button", { name: "Clear all", exact: true }).click();
  expect(await scopes.getByRole("checkbox", { checked: true }).count()).toBe(0);
  await expect(
    owner.getByRole("button", { name: "Generate API token", exact: true }),
  ).toBeDisabled();
  await scopes
    .getByRole("button", { name: "Website drafts", exact: true })
    .click();
  await expect(
    scopes.getByRole("checkbox", {
      name: "Publish website content and settings on request",
      exact: true,
    }),
  ).not.toBeChecked();
  await scopes
    .getByRole("button", { name: "Select all Website actions", exact: true })
    .click();
  for (const name of [
    "Capture private website previews",
    "Publish website content and settings on request",
  ])
    await scopes.getByRole("checkbox", { name, exact: true }).uncheck();
  await scopes
    .getByRole("checkbox", {
      name: "Read approved reference websites",
      exact: true,
    })
    .check();
  await owner
    .getByLabel("Approved reference websites", { exact: true })
    .fill("https://www.rotary.org");
  await owner
    .getByLabel("Token name", { exact: true })
    .fill("Synthetic REST script");
  await owner
    .getByRole("tab", { name: "Documentation & tester", exact: true })
    .click();
  await expect(
    owner.getByRole("button", { name: "Test MCP connection", exact: true }),
  ).toHaveCount(0);
  await owner.getByRole("tab", { name: "API tokens", exact: true }).click();
  await expect(owner.getByLabel("Token name", { exact: true })).toHaveValue(
    "Synthetic REST script",
  );
  const created = owner.waitForResponse(
    (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
  );
  await owner
    .getByRole("button", { name: "Generate API token", exact: true })
    .click();
  const response = await created;
  expect(response.status()).toBe(200);
  const rest = (await response.json()) as Issued;
  expect(rest.key.startsWith("rp_rest_")).toBe(true);
  await expect(
    owner.getByRole("heading", { name: "Save your API token", exact: true }),
  ).toBeVisible();
  expect(
    await owner
      .getByLabel("New API token", { exact: true })
      .getAttribute("type"),
  ).toBe("password");
  await owner
    .getByRole("button", { name: "Use in live tester", exact: true })
    .click();
  await owner
    .getByRole("button", { name: "Send read request", exact: true })
    .click();
  await expect(
    owner.getByRole("region", { name: "Test response" }).getByRole("status"),
  ).toHaveText("Request succeeded · HTTP 200");
  // REST token issuance and live requests work while MCP remains disabled.
  expect((await owner.request.get("/api/mcp")).status()).toBe(409);
  await owner.getByRole("tab", { name: "API tokens", exact: true }).click();
  await owner
    .getByRole("button", { name: "I saved the token", exact: true })
    .click();
  await owner.reload();
  await expect(
    owner.getByRole("button", {
      name: "Revoke Synthetic REST script",
      exact: true,
    }),
  ).toBeVisible();
  await capture(owner, "rest-tokens");

  await owner.goto("/admin/integrations");
  await owner.getByRole("button", { name: "Enable MCP", exact: true }).click();
  await owner
    .getByRole("button", { name: "Confirm enable MCP", exact: true })
    .click();
  await expect(
    owner.getByRole("button", { name: "Disable MCP", exact: true }),
  ).toBeVisible();
  await owner
    .getByRole("link", { name: "Connections & setup guide MCP", exact: true })
    .click();
  await expect(
    owner.getByRole("heading", { name: "MCP", exact: true }),
  ).toBeVisible();
  await expect(
    owner.getByRole("heading", { name: "Connect with OAuth", exact: true }),
  ).toBeVisible();
  await owner.getByRole("radio", { name: /^MCP access key/ }).check();
  await owner
    .getByLabel("MCP key name", { exact: true })
    .fill("Synthetic MCP assistant");
  const mcpScopes = owner.getByRole("group", {
    name: "Allowed actions",
    exact: true,
  });
  await mcpScopes
    .getByRole("button", { name: "Select all Website actions", exact: true })
    .click();
  for (const name of [
    "Capture private website previews",
    "Publish website content and settings on request",
  ])
    await mcpScopes.getByRole("checkbox", { name, exact: true }).uncheck();
  await mcpScopes
    .getByRole("checkbox", {
      name: "Read approved reference websites",
      exact: true,
    })
    .check();
  await owner
    .getByLabel("Approved reference websites", { exact: true })
    .fill("https://www.rotary.org");
  const mcpCreated = owner.waitForResponse(
    (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
  );
  await owner
    .getByRole("button", { name: "Generate MCP access key", exact: true })
    .click();
  const mcpResponse = await mcpCreated;
  expect(mcpResponse.status()).toBe(200);
  const mcp = (await mcpResponse.json()) as Issued;
  expect(mcp.key.startsWith("rp_mcp_") && mcp.key !== rest.key).toBe(true);
  await owner
    .getByRole("button", { name: "Use in connection test", exact: true })
    .click();
  await owner
    .getByRole("button", { name: "Test MCP connection", exact: true })
    .click();
  await expect(
    owner.getByRole("region", { name: "Test response" }).getByRole("status"),
  ).toHaveText("Request succeeded · HTTP 200");
  await owner.getByRole("tab", { name: "Connections", exact: true }).click();
  await owner
    .getByRole("button", { name: "I saved the key", exact: true })
    .click();
  await expect(
    owner.getByRole("button", {
      name: "Revoke Synthetic REST script",
      exact: true,
    }),
  ).toHaveCount(0);
  await capture(owner, "mcp-keys");
  const lists = await Promise.all(
    ["rest", "mcp"].map(
      async (transport) =>
        (
          await (
            await owner.request.get(`${endpoint}?transport=${transport}`)
          ).json()
        ).connections as { id: string }[],
    ),
  );
  expect(lists[0].map((item) => item.id)).toEqual([rest.id]);
  expect(lists[1].map((item) => item.id)).toEqual([mcp.id]);
  expect(
    (
      await owner.request.get("/api/v1/capabilities", {
        headers: { authorization: `Bearer ${mcp.key}` },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await owner.request.get("/api/mcp", {
        headers: { authorization: `Bearer ${rest.key}` },
      })
    ).status(),
  ).toBe(401);
  return { rest, mcp };
}

export async function capture(owner: Page, name: string) {
  const viewport = owner.viewportSize();
  await owner.screenshot({
    path: `.local/integrations-${name}-desktop.png`,
    fullPage: true,
  });
  await owner.setViewportSize({ width: 390, height: 844 });
  expect(
    await owner.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await owner.screenshot({
    path: `.local/integrations-${name}-phone.png`,
    fullPage: true,
  });
  if (viewport) await owner.setViewportSize(viewport);
}
