import { randomBytes } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { lumaSyncJourney } from "./luma-sync-journey";
import { lumaWebhookJourney } from "./luma-webhook-journey";
import { lumaPurchaseJourney } from "./luma-purchase-journey";
import type { SignInGuest } from "./guest-access-journey";

/** B01 continuation: real owner session, synthetic credential, loopback provider. */
export async function lumaConnectionJourney(
  owner: Page,
  manager: Page,
  visitor: Page,
  browser: Browser,
  signIn: SignInGuest,
) {
  const endpoint = "/api/admin/integrations/luma/connection";
  const publicUrl = visitor.url();
  const link = visitor.getByRole("link", {
    name: "Continue to Luma",
    exact: true,
  });
  const destination = await link.getAttribute("href");
  const key = `synthetic-${randomBytes(24).toString("hex")}`;
  expect((await visitor.request.get(endpoint)).status()).toBe(401);
  expect((await manager.request.get(endpoint)).status()).toBe(403);
  expect(
    (
      await manager.request.post(endpoint, {
        headers: { origin: smokeOrigin },
        data: {
          operation: "disconnect",
          values: { expectedVersion: 0, confirmed: true },
        },
      })
    ).status(),
  ).toBe(403);
  await owner.goto("/admin/integrations");
  await owner
    .getByRole("link", { name: "Configure Luma", exact: true })
    .click();
  await expect(owner).toHaveURL(/\/admin\/integrations\/luma$/);
  const panel = owner.getByRole("region", {
    name: "Luma API connection",
    exact: true,
  });
  await expect(
    panel.getByText("No API key saved", { exact: true }),
  ).toBeVisible();
  await panel.getByLabel("Calendar API key", { exact: true }).fill(key);
  await panel
    .getByRole("button", { name: "Review saving API key", exact: true })
    .click();
  async function confirm(title: string) {
    const dialog = owner.getByRole("dialog", { name: title, exact: true });
    await expect(
      dialog.getByRole("button", {
        name: "Confirm API connection action",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog
      .getByRole("checkbox", {
        name: "I confirm this API connection action.",
        exact: true,
      })
      .check();
    await dialog
      .getByRole("button", {
        name: "Confirm API connection action",
        exact: true,
      })
      .click();
    await expect(dialog).toHaveCount(0);
  }
  await confirm("Review API key storage");
  await expect(
    panel.getByText("Saved · not checked", { exact: true }),
  ).toBeVisible();
  expect(
    (await panel
      .getByLabel("Replacement API key", { exact: true })
      .inputValue()) === "",
  ).toBe(true);
  const saved = await owner.request.get(endpoint);
  expect(saved.headers()["cache-control"]).toContain("no-store");
  const savedBody = await saved.text();
  expect(savedBody.includes(key)).toBe(false);
  expect(savedBody.includes('credential"')).toBe(false);
  expect(
    (
      await owner.request.post(endpoint, {
        headers: { origin: "https://untrusted.example" },
        data: {
          operation: "check",
          values: { expectedVersion: 1, confirmed: true },
        },
      })
    ).status(),
  ).toBe(403);
  await panel
    .getByRole("button", { name: "Review connection check", exact: true })
    .click();
  await confirm("Review API connection check");
  await expect(
    panel.getByText("Calendar access checked", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("cal-synthetic-browser", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText(/not live Luma verification/)).toBeVisible();
  await owner
    .getByRole("link", { name: "All integrations", exact: true })
    .click();
  const card = owner.getByRole("article", { name: "Luma", exact: true });
  await expect(card.getByText("Enabled", { exact: true })).toBeVisible();
  await expect(
    card.getByText("Synthetic connection checked", { exact: true }),
  ).toBeVisible();
  // The catalogue never renders a credential field or mislabels a fixture as live.
  await expect(owner.locator('input[type="password"]')).toHaveCount(0);
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await owner.setViewportSize({ width, height: 1000 });
    expect(
      await owner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await owner.screenshot({
      path: `.local/integration-cards-enabled-${device}.png`,
      fullPage: true,
      mask: [owner.locator(".admin-account")],
    });
  }
  await card.getByRole("link", { name: "Configure Luma", exact: true }).click();
  await expect(
    panel.getByText("Calendar access checked", { exact: true }),
  ).toBeVisible();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await owner.setViewportSize({ width, height: 1000 });
    expect(
      await owner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel.screenshot({ path: `.local/luma-connection-${device}.png` });
  }
  await lumaSyncJourney(manager, visitor);
  await lumaPurchaseJourney(manager, visitor, browser, signIn);
  await lumaWebhookJourney(owner, manager, visitor);
  const secondKey = `synthetic-${randomBytes(24).toString("hex")}`;
  await panel
    .getByLabel("Replacement API key", { exact: true })
    .fill(secondKey);
  await panel
    .getByRole("button", { name: "Review key replacement", exact: true })
    .click();
  await confirm("Review API key storage");
  await expect(
    panel.getByText("Saved · not checked", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("cal-synthetic-browser", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Review disconnect", exact: true })
    .click();
  const disconnect = owner.getByRole("dialog", {
    name: "Review API disconnect",
    exact: true,
  });
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await owner.setViewportSize({ width, height: 1000 });
    await disconnect.screenshot({
      path: `.local/luma-disconnect-${device}.png`,
    });
  }
  await confirm("Review API disconnect");
  await expect(
    panel.getByText("No API key saved", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Review connection check", exact: true }),
  ).toBeDisabled();
  const disconnected = await owner.request.get(endpoint);
  const body = await disconnected.text();
  expect(body.includes(key) || body.includes(secondKey)).toBe(false);
  await visitor.goto(publicUrl);
  await expect(link).toHaveAttribute("href", destination!);
  await manager.reload();
  const sync = manager.getByRole("region", {
    name: "Luma reconciliation controls",
    exact: true,
  });
  await expect(sync).not.toBeVisible();
  await manager
    .locator("summary")
    .filter({ hasText: /^Luma guest imports \(unavailable\)$/ })
    .click();
  await expect(
    sync.getByRole("button", {
      name: "Review guest reconciliation",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    sync.getByText("Complete · 2 provider records", { exact: true }),
  ).toBeVisible();
}
