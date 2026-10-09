import { expect, type Page } from "@playwright/test";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { capture } from "./integration-credentials-journey";
import { revokeOAuthConnection } from "./oauth-connections-journey";

/** Complete authoring grant with a separate media opt-in; only synthetic local records. */
export async function oauthWebsiteRecreationJourney(owner: Page) {
  const endpoint = "/api/admin/integrations/automation/oauth";
  const name = "Synthetic website recreation";
  const panel = owner.getByRole("region", { name: "Connect with OAuth" });
  const picker = panel.getByRole("group", {
    name: "OAuth allowed actions",
    exact: true,
  });
  await panel.getByLabel("OAuth connection name", { exact: true }).fill(name);
  await panel
    .getByRole("textbox", { name: "OAuth callback URLs", exact: true })
    .fill(`${smokeOrigin}/synthetic-website-recreation-callback`);
  await picker
    .getByRole("button", { name: "Website recreation", exact: true })
    .click();
  for (const action of [
    "Read website content",
    "Create and edit website drafts",
    "Copy pages, add languages and restore drafts",
    "Edit draft website menus and appearance",
    "Capture private website previews",
    "Read the club media catalogue",
    "Upload images and edit private media metadata",
    "View image pixels, including private media",
    "Read approved reference websites",
    "Read project stories and drafts",
    "Create and edit project drafts",
  ])
    await expect(
      picker.getByRole("checkbox", { name: action, exact: true }),
    ).toBeChecked();
  const publications = picker
    .locator(".scope-picker-groups")
    .getByRole("checkbox", { name: /^Publish / });
  for (const publication of await publications.all())
    await expect(publication).not.toBeChecked();
  const imagePublication = picker.getByRole("checkbox", {
    name: "Publish reviewed images",
    exact: true,
  });
  const groupedImagePublication = picker
    .locator(".scope-picker-groups")
    .getByRole("checkbox", {
      name: "Make reviewed images public on request",
      exact: true,
    });
  await expect(imagePublication).not.toBeChecked();
  await expect(groupedImagePublication).not.toBeChecked();
  await owner
    .getByLabel("Reference website domains", { exact: true })
    .fill("https://www.rotaract.lu/a-page");
  await panel
    .getByRole("button", {
      name: "Use rotaract.lu and subdomains",
      exact: true,
    })
    .click();
  await expect(
    panel.getByLabel("Reference website domains", { exact: true }),
  ).toHaveValue("rotaract.lu");
  await expect(
    panel.getByRole("list", {
      name: "Reference website coverage",
      exact: true,
    }),
  ).toContainText(
    "HTTPS rotaract.lu and all subdomains, including www.rotaract.lu",
  );
  await capture(owner, "mcp-website-recreation");
  await captureTask(owner);
  // Keyboard selection opts into only publication of explicitly reviewed images.
  await imagePublication.focus();
  await imagePublication.press("Space");
  await expect(imagePublication).toBeChecked();
  await expect(groupedImagePublication).toBeChecked();
  await capture(owner, "mcp-website-recreation-media-opt-in");
  const created = owner.waitForResponse(
    (response) =>
      response.url().endsWith(endpoint) &&
      response.request().method() === "POST",
  );
  await panel
    .getByRole("button", { name: "Create OAuth connection", exact: true })
    .click();
  expect((await created).status()).toBe(200);
  await panel
    .getByRole("button", { name: "I saved the OAuth details", exact: true })
    .click();
  await owner.reload();
  const saved = (await (await owner.request.get(endpoint)).json()) as {
    clients: {
      name: string;
      scopes: string[];
      sourceOrigins: string[];
    }[];
  };
  const connection = saved.clients.find((client) => client.name === name);
  expect(connection?.scopes.slice().sort()).toEqual(
    [
      "website:read",
      "website:write",
      "website:manage",
      "website:settings",
      "website:preview",
      "media:read",
      "media:write",
      "media:inspect",
      "sources:read",
      "media:publish",
      "projects:read",
      "projects:write",
    ].sort(),
  );
  expect(connection?.sourceOrigins).toEqual(["rotaract.lu"]);
  await revokeOAuthConnection(owner, name);
  await owner.getByRole("tab", { name: "Connections", exact: true }).click();
  // Return to the manual callback setup used by the principal consent journey.
  await panel
    .getByRole("combobox", { name: "AI app", exact: true })
    .selectOption("custom");
  await expect(
    panel.getByRole("textbox", { name: "OAuth callback URLs", exact: true }),
  ).toBeVisible();
}

async function captureTask(owner: Page) {
  const viewport = owner.viewportSize();
  const task = owner
    .getByRole("group", { name: "OAuth allowed actions", exact: true })
    .locator(".scope-picker-task");
  await task.screenshot({
    path: ".local/website-recreation-permissions-desktop.png",
  });
  await owner.setViewportSize({ width: 390, height: 844 });
  await task.screenshot({
    path: ".local/website-recreation-permissions-phone.png",
  });
  if (viewport) await owner.setViewportSize(viewport);
}
