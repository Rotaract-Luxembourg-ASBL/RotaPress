import { createHmac, randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";

/** Real staff OTP sessions; only synthetic signed payloads reach the local receiver. */
export async function lumaWebhookJourney(
  owner: Page,
  manager: Page,
  visitor: Page,
) {
  const endpoint = "/api/admin/integrations/luma/webhook";
  expect((await visitor.request.get(endpoint)).status()).toBe(401);
  expect((await manager.request.get(endpoint)).status()).toBe(403);
  const generate = {
    operation: "generate",
    values: { expectedVersion: 0, confirmed: true },
  };
  expect(
    (
      await manager.request.post(endpoint, {
        headers: { origin: smokeOrigin },
        data: generate,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.request.post(endpoint, {
        headers: { origin: "https://untrusted.example" },
        data: generate,
      })
    ).status(),
  ).toBe(403);
  await owner.goto("/admin/integrations/luma");
  const panel = owner.getByRole("region", {
    name: "Luma webhooks",
    exact: true,
  });
  await panel
    .getByRole("button", { name: "Generate callback URL", exact: true })
    .click();
  async function confirm() {
    const dialog = owner.getByRole("dialog", {
      name: "Review Luma webhook change",
      exact: true,
    });
    const button = dialog.getByRole("button", {
      name: "Confirm webhook change",
      exact: true,
    });
    await expect(button).toBeDisabled();
    await dialog
      .getByRole("checkbox", {
        name: "I confirm this webhook change.",
        exact: true,
      })
      .check();
    await button.click();
    await expect(dialog).toHaveCount(0);
  }
  await confirm();
  const callback = panel.getByLabel("Callback URL", { exact: true });
  await expect(callback).toBeVisible();
  const callbackUrl = await callback.inputValue();
  expect(new URL(callbackUrl).origin).toBe(smokeOrigin);
  const secret = `whsec_${randomBytes(32).toString("hex")}`;
  await panel.getByLabel("Luma signing secret", { exact: true }).fill(secret);
  await panel
    .getByRole("button", { name: "Review webhook settings", exact: true })
    .click();
  await confirm();
  await expect(
    panel.getByText("Reception enabled", { exact: true }),
  ).toBeVisible();
  expect(
    (await panel
      .getByLabel("Replacement signing secret", { exact: true })
      .inputValue()) === "",
  ).toBe(true);
  const settings = await owner.request.get(endpoint);
  expect(settings.headers()["cache-control"]).toContain("no-store");
  expect((await settings.text()).includes(secret)).toBe(false);
  const body = JSON.stringify({
    type: "guest.updated",
    data: {
      event: { id: "evt-synthetic-browser" },
      user_email: "synthetic-webhook@example.test",
    },
  });
  expect(
    (
      await visitor.request.post(callbackUrl, {
        headers: { "content-type": "application/json" },
        data: body,
      })
    ).status(),
  ).toBe(401);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(
      (
        await visitor.request.post(callbackUrl, {
          headers: {
            "content-type": "application/json",
            "webhook-signature": signature,
          },
          data: body,
        })
      ).status(),
    ).toBe(202);
  }
  await panel
    .getByRole("button", { name: "Refresh notifications", exact: true })
    .click();
  await expect(
    panel.getByRole("link", { name: "Review event", exact: true }),
  ).toHaveCount(1);
  const receipt = await (await owner.request.get(endpoint)).json();
  expect(receipt.receipts).toHaveLength(1);
  expect(receipt.receipts[0].sourceId).toBeTruthy();
  await expect(
    panel.getByRole("link", { name: "Review event", exact: true }),
  ).toHaveAttribute(
    "href",
    `/admin/events/${receipt.receipts[0].eventId}?tab=participation&sourceId=${receipt.receipts[0].sourceId}`,
  );
  await expect(
    panel.getByText(`Booking source: ${receipt.receipts[0].sourceLabel}`, {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    JSON.stringify(receipt).includes("synthetic-webhook@example.test"),
  ).toBe(false);
  await owner.reload();
  await expect(
    panel.getByRole("link", { name: "Review event", exact: true }),
  ).toHaveCount(1);
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
    await panel.screenshot({ path: `.local/luma-webhook-${device}.png` });
  }
  await panel
    .getByRole("button", { name: "Pause reception", exact: true })
    .click();
  await confirm();
  await expect(
    panel.getByText("Reception paused", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await visitor.request.post(callbackUrl, {
        headers: {
          "content-type": "application/json",
          "webhook-signature": signature,
        },
        data: body,
      })
    ).status(),
  ).toBe(503);
  await panel
    .getByRole("button", { name: "Remove signing secret", exact: true })
    .click();
  await confirm();
  await expect(
    panel.getByLabel("Luma signing secret", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "Review event", exact: true }),
  ).toHaveCount(1);
}
