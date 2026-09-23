import { expect, type Page } from "@playwright/test";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { runLocalTestJobs } from "./local-jobs";
import { lumaSourceJourney } from "./luma-source-journey";

/** B01 continuation; synthetic records stay outside every screenshot. */
export async function lumaSyncJourney(manager: Page, visitor: Page) {
  const eventId = new URL(visitor.url()).pathname.split("/")[2];
  const endpoint = `/api/admin/events/${eventId}/luma-api`;
  expect((await visitor.request.get(endpoint)).status()).toBe(401);
  await manager.goto(`/admin/events/${eventId}?tab=participation`);
  const controls = manager.getByRole("region", {
    name: "Luma reconciliation controls",
    exact: true,
  });
  await controls
    .getByLabel("Luma API event ID", { exact: true })
    .fill("evt-synthetic-browser");
  await controls
    .getByRole("button", { name: "Review API event link", exact: true })
    .click();
  const dialog = manager.getByRole("dialog", {
    name: "Review Luma API event action",
    exact: true,
  });
  async function confirm() {
    await expect(
      dialog.getByRole("button", {
        name: "Confirm event API action",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog
      .getByRole("checkbox", {
        name: "I confirm this event's API action.",
        exact: true,
      })
      .check();
    await dialog
      .getByRole("button", { name: "Confirm event API action", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  }
  await confirm();
  await expect(
    controls.getByText("Reconciliation enabled", { exact: true }),
  ).toBeVisible();
  const linked = await manager.request.get(endpoint);
  expect(linked.headers()["cache-control"]).toContain("no-store");
  const current = await linked.json();
  expect(current.count).toBe(0);
  expect(
    (
      await manager.request.post(`${endpoint}/reconcile`, {
        headers: { origin: "https://untrusted.example" },
        data: {
          expectedVersion: current.version,
          requestId: crypto.randomUUID(),
          confirmed: true,
        },
      })
    ).status(),
  ).toBe(403);
  await controls
    .getByRole("button", { name: "Review guest reconciliation", exact: true })
    .click();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await manager.setViewportSize({ width, height: 1000 });
    await dialog.screenshot({ path: `.local/luma-sync-review-${device}.png` });
  }
  await confirm();
  const queue = controls.getByLabel("Queued reconciliations", { exact: true });
  await expect(queue.getByText("Queued", { exact: true })).toBeVisible();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await manager.setViewportSize({ width, height: 1000 });
    await controls.screenshot({
      path: `.local/luma-jobs-queued-${device}.png`,
    });
  }
  await queue
    .getByRole("button", { name: "Review cancelling request", exact: true })
    .click();
  const cancel = manager.getByRole("dialog", {
    name: "Cancel queued reconciliation",
    exact: true,
  });
  await expect(
    cancel.getByRole("button", { name: "Confirm cancellation", exact: true }),
  ).toBeDisabled();
  await cancel.getByRole("checkbox").check();
  await cancel
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(cancel).toHaveCount(0);
  await expect(queue.getByText("Cancelled", { exact: true })).toBeVisible();
  await controls
    .getByRole("button", { name: "Review guest reconciliation", exact: true })
    .click();
  await confirm();
  const processed = await runLocalTestJobs(smokeOrigin, true);
  expect(
    processed.find((row) => row.event === "luma_reconciliations_processed")
      ?.succeeded,
  ).toBe(1);
  const replay = await runLocalTestJobs(smokeOrigin, true);
  expect(
    replay.find((row) => row.event === "luma_reconciliations_processed")
      ?.processed,
  ).toBe(0);
  await controls
    .getByRole("button", { name: "Refresh reconciliation status", exact: true })
    .click();
  await expect(
    controls.getByText("Complete · 2 provider records", { exact: true }),
  ).toBeVisible();
  const imported = await manager.request.get(endpoint);
  const body = await imported.json();
  expect(body.count).toBe(2);
  expect(body.guests).toHaveLength(2);
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await manager.setViewportSize({ width, height: 1000 });
    expect(
      await manager.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await controls.screenshot({ path: `.local/luma-sync-${device}.png` });
  }
  await controls
    .getByRole("button", {
      name: "Review disabling reconciliation",
      exact: true,
    })
    .click();
  await confirm();
  await expect(
    controls.getByText("Reconciliation disabled", { exact: true }),
  ).toBeVisible();
  await expect(
    controls.getByRole("button", {
      name: "Review guest reconciliation",
      exact: true,
    }),
  ).toBeDisabled();
  const disabled = await (await manager.request.get(endpoint)).json();
  expect(disabled.count).toBe(2);
  expect(
    (
      await manager.request.post(`${endpoint}/reconcile`, {
        headers: { origin: smokeOrigin },
        data: {
          expectedVersion: disabled.version,
          requestId: crypto.randomUUID(),
          confirmed: true,
        },
      })
    ).status(),
  ).toBe(409);
  await controls
    .getByRole("button", {
      name: "Review enabling reconciliation",
      exact: true,
    })
    .click();
  await confirm();
  await lumaSourceJourney(manager, eventId);
  await visitor.reload();
  await expect(
    visitor.getByRole("link", { name: "Continue to Luma", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://luma.com/rotapress-synthetic-browser-event",
  );
  const publicHtml = await visitor.content();
  expect(
    body.guests.every(
      (guest: { email: string }) => !publicHtml.includes(guest.email),
    ),
  ).toBe(true);
  expect((await visitor.request.get(endpoint)).status()).toBe(401);
}
