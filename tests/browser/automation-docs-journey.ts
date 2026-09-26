import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import { capture } from "./integration-credentials-journey";

export async function automationDocsJourney(
  owner: Page,
  key: string,
  mcpKey: string,
) {
  await owner.goto("/admin/integrations/rest?tab=docs");
  await expect(
    owner.getByRole("heading", {
      name: "REST API documentation & live tester",
      exact: true,
    }),
  ).toBeVisible();
  const keyField = owner.getByLabel("REST API token", { exact: true });
  const status = owner
    .getByRole("region", { name: "Test response", exact: true })
    .getByRole("status");
  await keyField.fill(key);
  await owner
    .getByRole("button", { name: "Send read request", exact: true })
    .click();
  await expect(status).toHaveText("Request succeeded · HTTP 200");
  const downloadEvent = owner.waitForEvent("download");
  await owner
    .getByRole("button", { name: "Download OpenAPI", exact: true })
    .click();
  const download = await downloadEvent;
  const spec = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.components.schemas.website_save_response).toBeDefined();
  expect(JSON.stringify(spec).includes(key)).toBe(false);
  const operation = owner.getByRole("combobox", {
    name: "Endpoint",
    exact: true,
  });
  await operation.selectOption("forms_list");
  await owner
    .getByRole("button", { name: "Send read request", exact: true })
    .click();
  await expect(status).toHaveText("Request failed · HTTP 403");
  await operation.selectOption("content_import");
  const input = {
    requestId: randomUUID(),
    pages: [
      {
        title: "Tester private draft",
        slug: "tester-private-draft",
        locale: "en",
        sections: [{ text: "Synthetic documentation fixture." }],
      },
    ],
  };
  const jsonField = owner.getByRole("textbox", {
    name: "Request input (JSON)",
    exact: true,
  });
  await jsonField.fill(JSON.stringify(input));
  await owner
    .getByRole("button", { name: "Send write request", exact: true })
    .click();
  await expect(status).toHaveText("Request succeeded · HTTP 200");
  expect(
    (await owner.request.get("/pages/en/tester-private-draft")).status(),
  ).toBe(404);
  await jsonField.fill("{");
  await owner
    .getByRole("button", { name: "Send write request", exact: true })
    .click();
  await expect(
    owner
      .getByRole("region", { name: "Try a request", exact: true })
      .getByRole("alert"),
  ).toHaveText("Enter valid JSON.");
  await owner.getByRole("tab", { name: "API tokens", exact: true }).click();
  // Keyboard tab navigation keeps entered work intact and restores focus.
  await owner
    .getByRole("tab", { name: "API tokens", exact: true })
    .press("ArrowRight");
  await expect(
    owner.getByRole("tab", { name: "Documentation & tester", exact: true }),
  ).toBeFocused();
  await expect(jsonField).toHaveValue("{");
  const stored = await owner.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(stored.includes(key)).toBe(false);
  await owner.reload();
  await expect(keyField).toHaveValue("");
  await operation.selectOption("website_list");
  await capture(owner, "rest-docs");

  await owner.goto("/admin/integrations/mcp?tab=guide");
  await expect(
    owner.getByRole("heading", { name: "MCP setup guide", exact: true }),
  ).toBeVisible();
  await expect(
    owner.getByText(
      "OAuth discovery, consent and token refresh are not implemented.",
    ),
  ).toHaveCount(0);
  await capture(owner, "mcp-guide");
  await owner
    .getByRole("tab", { name: "Tools & connection test", exact: true })
    .click();
  await expect(
    owner.getByRole("button", { name: "Download OpenAPI", exact: true }),
  ).toHaveCount(0);
  await owner
    .getByLabel("MCP access key or OAuth access token", { exact: true })
    .fill(mcpKey);
  await owner
    .getByRole("button", { name: "Test MCP connection", exact: true })
    .click();
  await expect(status).toHaveText("Request succeeded · HTTP 200");
  await owner
    .getByRole("combobox", { name: "MCP tool", exact: true })
    .selectOption("content_import");
  await jsonField.fill(JSON.stringify(input));
  await owner
    .getByRole("button", { name: "Send write request", exact: true })
    .click();
  await expect(status).toHaveText("Request succeeded · HTTP 200");
  await owner
    .getByRole("button", { name: "Clear credential and response", exact: true })
    .click();
  await expect(
    owner.getByRole("region", { name: "Test response", exact: true }),
  ).toHaveCount(0);
  await owner
    .getByRole("combobox", { name: "MCP tool", exact: true })
    .selectOption("automation_capabilities");
  await capture(owner, "mcp-tools");
}
