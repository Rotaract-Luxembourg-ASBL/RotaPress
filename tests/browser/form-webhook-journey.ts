import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import type { WebhookSettings } from "../../src/features/forms/webhook_schemas";

const panel = (page: Page) =>
  page.locator("section.forms-settings").filter({
    has: page.getByRole("heading", { name: "Outgoing webhook", exact: true }),
  });

async function readSettings(page: Page, formId: string) {
  const response = await page.request.get(`/api/admin/forms/${formId}/webhook`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const result = (await response.json()) as WebhookSettings;
  // Check names before values so a regression cannot print a returned secret.
  expect(Object.keys(result).sort()).toEqual([
    "configured",
    "deliveries",
    "deliveryEnabled",
    "enabled",
    "endpoint",
    "revision",
    "secretConfigured",
  ]);
  expect(result.deliveryEnabled).toBe(false);
  return result;
}

/** Configure a synthetic destination while installation delivery is paused. */
export async function configureFormWebhook(page: Page, formId: string) {
  await readSettings(page, formId);
  const settings = panel(page);
  await settings
    .getByLabel("Destination URL", { exact: true })
    .fill("https://hooks.example.org/responses");
  const secret = settings.getByLabel("Signing secret", { exact: true });
  await expect(secret).toHaveAttribute("type", "password");
  // Send a native input event without putting the secret in a Playwright fill
  // action label. Tracing/video are disabled; no secret enters test artifacts.
  await secret.evaluate((input, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, randomBytes(32).toString("hex"));
  await settings
    .getByRole("checkbox", {
      name: "Queue notifications for new responses",
      exact: true,
    })
    .check();
  await settings
    .getByRole("button", { name: "Save webhook", exact: true })
    .click();
  await expect(settings.getByText(/^Webhook settings saved\./)).toBeVisible();
  await expect(
    settings.getByLabel("Replace signing secret (optional)", { exact: true }),
  ).toHaveValue("");
  const saved = await readSettings(page, formId);
  expect(saved.secretConfigured).toBe(true);
  expect(saved.enabled).toBe(true);
  expect(saved.endpoint).toBe("https://hooks.example.org/responses");
  expect(saved.deliveries).toHaveLength(0);
}

/** B02's real submission is queued once; local job processing makes no HTTP call. */
export async function reviewFormWebhook(
  page: Page,
  formId: string,
  submissionId: string,
) {
  const saved = await readSettings(page, formId);
  expect(saved.deliveries).toHaveLength(1);
  expect(saved.deliveries[0].submissionId).toBe(submissionId);
  expect(saved.deliveries[0].status).toBe("pending");
  expect(saved.deliveries[0].attempts).toBe(0);
  await page.goto(`/admin/forms/${formId}`);
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const settings = panel(page);
  await expect(
    settings.getByLabel("Replace signing secret (optional)", { exact: true }),
  ).toHaveValue("");
  await expect(
    settings.getByRole("link", { name: "View response", exact: true }),
  ).toHaveAttribute(
    "href",
    `/admin/forms/${formId}/submissions/${submissionId}`,
  );
  await expect(
    settings.getByText(/Outgoing delivery is paused for this installation/),
  ).toBeVisible();
  await settings.screenshot({ path: ".local/forms-webhook-settings.png" });
}
