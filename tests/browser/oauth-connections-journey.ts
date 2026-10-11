import { expect, type Page } from "@playwright/test";
import { capture } from "./integration-credentials-journey";

export async function revokeOAuthConnection(owner: Page, name: string) {
  await owner
    .getByRole("tab", { name: "Existing connections", exact: true })
    .click();
  await owner.getByLabel(`More options for ${name}`, { exact: true }).click();
  await owner
    .getByRole("button", { name: `Revoke OAuth ${name}`, exact: true })
    .click();
  const dialog = owner.getByRole("dialog", {
    name: `Revoke ${name}?`,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Confirm revoke", exact: true })
    .click();
  await expect(
    owner.getByText(`Revoked ${name}.`, { exact: true }),
  ).toBeVisible();
}

/** Actual registered OAuth client, consent and tool history from the principal journey. */
export async function oauthConnectionsJourney(
  owner: Page,
  accessToken: string,
) {
  const name = "Synthetic OAuth assistant";
  await owner.goto("/admin/integrations/mcp");
  const creationTab = owner.getByRole("tab", {
    name: "Connections",
    exact: true,
  });
  await creationTab.focus();
  await owner.keyboard.press("ArrowRight");
  await expect(
    owner.getByRole("tab", { name: "Existing connections", exact: true }),
  ).toBeFocused();
  await expect(owner.getByText("Consent saved", { exact: true })).toBeVisible();
  await capture(owner, "existing-connections");
  const trigger = owner.getByRole("button", {
    name: `Permissions for ${name}`,
    exact: true,
  });
  await trigger.click();
  const dialog = owner.getByRole("dialog", { name, exact: true });
  const reference = dialog.getByRole("checkbox", {
    name: "Read approved reference websites",
    exact: true,
  });
  await reference.check();
  const origins = dialog.getByLabel("Reference website domains", {
    exact: true,
  });
  await origins.fill("https://www.rotaract.lu/path");
  await dialog.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(
    dialog.getByText("Automation capabilities", { exact: true }).first(),
  ).toBeVisible();
  await dialog.screenshot({ path: ".local/oauth-activity-desktop.png" });
  await dialog.getByRole("tab", { name: "Permissions", exact: true }).click();
  await expect(origins).toHaveValue("https://www.rotaract.lu/path");
  await owner.keyboard.press("Escape");
  await expect(
    dialog
      .getByRole("status")
      .filter({ hasText: "You have unsaved permission changes." }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  const save = dialog.getByRole("button", {
    name: "Save permissions",
    exact: true,
  });
  await save.click();
  await expect(dialog.getByRole("alert")).toContainText(/domain|HTTPS/);
  await expect(origins).toHaveValue("https://www.rotaract.lu/path");
  const coverage = dialog.getByRole("list", {
    name: "Reference website coverage",
    exact: true,
  });
  const conversion = dialog.getByRole("button", {
    name: "Use rotaract.lu and subdomains",
    exact: true,
  });
  const duplicates = Array<string>(6)
    .fill("https://www.rotaract.lu")
    .join("\n");
  await origins.fill(duplicates);
  await expect(origins).toHaveValue(duplicates);
  await expect(origins).toHaveAttribute("aria-invalid", "false");
  await expect(coverage.getByRole("listitem")).toHaveCount(1);
  await expect(conversion).toHaveCount(1);
  const distinctOrigins = Array.from(
    { length: 6 },
    (_, index) => `https://reference-${index}.rotary.org`,
  ).join("\n");
  await origins.fill(distinctOrigins);
  await expect(origins).toHaveValue(distinctOrigins);
  await expect(origins).toHaveAttribute("aria-invalid", "true");
  await expect(
    dialog.getByText("Add no more than five reference website entries.", {
      exact: true,
    }),
  ).toBeVisible();
  const exactOrigins = [
    "https://www.rotaract.lu",
    "https://rotaract.lu",
    "https://dev.rotaract.lu",
  ];
  await origins.fill(exactOrigins.join("\n"));
  await expect(origins).toHaveValue(exactOrigins.join("\n"));
  await expect(coverage.getByRole("listitem")).toHaveCount(3);
  await expect(
    coverage.getByText("Exact HTTPS host only · subdomains are not included", {
      exact: true,
    }),
  ).toHaveCount(3);
  for (const exactOrigin of exactOrigins)
    await expect(
      coverage.getByText(exactOrigin, { exact: true }),
    ).toBeVisible();
  await expect(conversion).toHaveCount(1);
  await conversion.locator("..").screenshot({
    path: ".local/oauth-reference-group-desktop.png",
  });
  await coverage.screenshot({
    path: ".local/oauth-reference-coverage-desktop.png",
  });
  const unrelated = "https://reference.rotary.org";
  const invalid = "invalid-reference";
  const pasted = [...exactOrigins, unrelated, invalid].join("\n");
  await origins.fill(pasted);
  await expect(origins).toHaveValue(pasted);
  await expect(origins).toHaveAttribute("aria-invalid", "true");
  await expect(coverage.getByRole("listitem")).toHaveCount(4);
  await expect(conversion).toHaveCount(1);
  const viewport = owner.viewportSize();
  await owner.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await conversion.locator("..").screenshot({
    path: ".local/oauth-reference-group-phone.png",
  });
  await conversion.focus();
  await expect(conversion).toBeFocused();
  await conversion.press("Enter");
  await expect(origins).toHaveValue(`rotaract.lu\n${unrelated}\n${invalid}`);
  await expect(origins).toBeFocused();
  await expect(origins).toHaveAttribute("aria-invalid", "true");
  await expect(conversion).toHaveCount(0);
  await expect(coverage.getByRole("listitem")).toHaveCount(2);
  await expect(coverage.getByText(unrelated, { exact: true })).toBeVisible();
  await expect(coverage).toContainText(
    "HTTPS rotaract.lu and all subdomains, including www.rotaract.lu",
  );
  await coverage.screenshot({
    path: ".local/oauth-reference-coverage-phone.png",
  });
  const savedOrigins = ["rotaract.lu", unrelated];
  await origins.fill(savedOrigins.join("\n"));
  await expect(origins).toHaveAttribute("aria-invalid", "false");
  await dialog
    .getByRole("checkbox", {
      name: "Copy pages, add languages and restore drafts",
      exact: true,
    })
    .uncheck();
  expect(
    await owner.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await dialog.screenshot({ path: ".local/oauth-permissions-phone.png" });
  await save.click();
  await expect(
    dialog.getByRole("status").filter({ hasText: "Permissions saved." }),
  ).toBeVisible();
  await expect(save).toBeDisabled();
  await dialog.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(
    dialog.getByText("Permissions updated · reconnect required", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog.screenshot({ path: ".local/oauth-activity-phone.png" });
  await owner.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await owner.reload();
  await expect(
    owner.getByRole("tab", { name: "Existing connections", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    owner.getByText("Reconnect required", { exact: true }),
  ).toBeVisible();
  await trigger.click();
  await expect(reference).toBeChecked();
  await expect(origins).toHaveValue(savedOrigins.join("\n"));
  await expect(
    dialog.getByRole("checkbox", {
      name: "Copy pages, add languages and restore drafts",
      exact: true,
    }),
  ).not.toBeChecked();
  // A concurrent saved edit gets a recoverable conflict, without losing the form.
  const endpoint = "/api/admin/integrations/automation/oauth";
  const list = (await (await owner.request.get(endpoint)).json()) as {
    clients: {
      clientId: string;
      scopes: string[];
      sourceOrigins: string[];
      permissionsRevision: string;
      name: string;
    }[];
  };
  const current = list.clients.find((item) => item.name === name)!;
  expect(current.sourceOrigins).toEqual(savedOrigins);
  expect(current.scopes).toContain("sources:read");
  expect(current.scopes).toContain("website:read");
  expect(current.scopes).not.toContain("website:manage");
  const changed = await owner.request.patch(endpoint, {
    headers: { origin: new URL(owner.url()).origin },
    data: {
      clientId: current.clientId,
      expectedRevision: current.permissionsRevision,
      scopes: ["website:read"],
      sourceOrigins: [],
    },
  });
  expect(changed.status()).toBe(200);
  await origins.fill("https://another.example.org");
  await save.click();
  await expect(dialog.getByRole("alert")).toContainText(
    "changed in another tab",
  );
  await expect(origins).toHaveValue("https://another.example.org");
  await dialog
    .getByRole("button", {
      name: "Discard edits and reload permissions",
      exact: true,
    })
    .click();
  await expect(reference).not.toBeChecked();
  await expect(save).toBeDisabled();
  if (viewport) await owner.setViewportSize(viewport);
  await dialog.screenshot({ path: ".local/oauth-permissions-desktop.png" });
  await owner.keyboard.press("Escape");
  expect(
    (
      await owner.request.get("/api/mcp", {
        headers: { authorization: `Bearer ${accessToken}` },
      })
    ).status(),
  ).toBe(401);
  await owner
    .getByRole("searchbox", { name: "Search connections", exact: true })
    .fill("No such assistant");
  await expect(
    owner.getByText("No matching connections", { exact: true }),
  ).toBeVisible();
  await owner
    .getByRole("button", { name: "Clear search", exact: true })
    .click();
}
