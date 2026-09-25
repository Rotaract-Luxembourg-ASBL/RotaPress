import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";

export async function automationDocsJourney(owner: Page, key: string) {
  await owner.goto("/admin/integrations/automation");
  await owner
    .getByRole("link", { name: "API documentation & tester", exact: true })
    .click();
  await expect(
    owner.getByRole("heading", {
      name: "API documentation & tester",
      exact: true,
    }),
  ).toBeVisible();
  const keyField = owner.getByLabel("Tester connection key", { exact: true });
  await keyField.fill(key);
  await owner
    .getByRole("button", { name: "Send read request", exact: true })
    .click();
  await expect(owner.getByRole("status")).toHaveText(
    "Request succeeded · HTTP 200",
  );
  await owner
    .getByRole("combobox", { name: "Protocol", exact: true })
    .selectOption("mcp");
  await owner
    .getByRole("button", { name: "Send read request", exact: true })
    .click();
  await expect(owner.getByRole("status")).toHaveText(
    "Request succeeded · HTTP 200",
  );
  await owner
    .getByRole("button", { name: "Test MCP connection", exact: true })
    .click();
  await expect(owner.getByRole("status")).toHaveText(
    "Request succeeded · HTTP 200",
  );
  const downloadEvent = owner.waitForEvent("download");
  await owner
    .getByRole("button", { name: "Download OpenAPI", exact: true })
    .click();
  const download = await downloadEvent;
  const spec = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.components.schemas.website_save_response).toBeDefined();
  expect(JSON.stringify(spec).includes(key)).toBe(false);
  await owner
    .getByRole("combobox", { name: "Operation", exact: true })
    .selectOption("forms_list");
  await owner
    .getByRole("combobox", { name: "Protocol", exact: true })
    .selectOption("rest");
  await owner
    .getByRole("button", { name: "Send read request", exact: true })
    .click();
  await expect(owner.getByRole("status")).toHaveText(
    "Request failed · HTTP 403",
  );
  await owner
    .getByRole("combobox", { name: "Operation", exact: true })
    .selectOption("content_import");
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
  await owner
    .getByRole("textbox", { name: "Request input (JSON)", exact: true })
    .fill(JSON.stringify(input));
  await owner
    .getByRole("button", { name: "Save private draft", exact: true })
    .click();
  await expect(owner.getByRole("status")).toHaveText(
    "Request succeeded · HTTP 200",
  );
  await owner
    .getByRole("combobox", { name: "Protocol", exact: true })
    .selectOption("mcp");
  await owner
    .getByRole("button", { name: "Save private draft", exact: true })
    .click();
  await expect(owner.getByRole("status")).toHaveText(
    "Request succeeded · HTTP 200",
  );
  expect(
    (await owner.request.get("/pages/en/tester-private-draft")).status(),
  ).toBe(404);
  await owner
    .getByRole("textbox", { name: "Request input (JSON)", exact: true })
    .fill("{");
  await owner
    .getByRole("button", { name: "Save private draft", exact: true })
    .click();
  await expect(
    owner
      .getByRole("region", { name: "Try a request", exact: true })
      .getByRole("alert"),
  ).toHaveText("Enter valid JSON.");
  await expect(
    owner.getByRole("textbox", { name: "Request input (JSON)", exact: true }),
  ).toHaveValue("{");
  const stored = await owner.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(stored.includes(key)).toBe(false);
  await owner.reload();
  await expect(keyField).toHaveValue("");
  await owner
    .getByRole("combobox", { name: "Operation", exact: true })
    .selectOption("website_list");
  const viewport = owner.viewportSize();
  await owner.screenshot({
    path: ".local/automation-docs-desktop.png",
    fullPage: true,
  });
  await owner.setViewportSize({ width: 390, height: 844 });
  expect(
    await owner.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await owner.screenshot({
    path: ".local/automation-docs-phone.png",
    fullPage: true,
  });
  if (viewport) await owner.setViewportSize(viewport);
}
