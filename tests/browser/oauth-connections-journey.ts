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
  const origins = dialog.getByLabel("Approved reference websites", {
    exact: true,
  });
  await origins.fill("https://www.example.org/path");
  await dialog.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(
    dialog.getByText("Automation capabilities", { exact: true }).first(),
  ).toBeVisible();
  await dialog.screenshot({ path: ".local/oauth-activity-desktop.png" });
  await dialog.getByRole("tab", { name: "Permissions", exact: true }).click();
  await expect(origins).toHaveValue("https://www.example.org/path");
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
  await expect(dialog.getByRole("alert")).toContainText(
    "HTTPS website origin without a path",
  );
  await expect(origins).toHaveValue("https://www.example.org/path");
  await origins.fill("https://www.example.org");
  await dialog
    .getByRole("checkbox", {
      name: "Copy pages, add languages and restore drafts",
      exact: true,
    })
    .uncheck();
  const viewport = owner.viewportSize();
  await owner.setViewportSize({ width: 390, height: 844 });
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
  await expect(origins).toHaveValue("https://www.example.org");
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
