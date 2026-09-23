import { readFile } from "node:fs/promises";
import { expect, type Browser, type Page } from "@playwright/test";
import type { GuestWorkspace } from "../../src/features/guests/guest_schemas";
import type { PurchaseView } from "../../src/features/guests/purchase_schemas";
import type { LumaSyncDto } from "../../src/integrations/luma/sync_schemas";
import type { SignInGuest } from "./guest-access-journey";
import { eventEntriesJourney } from "./event-entries-journey";
import { eventDrawJourney } from "./event-draw-journey";

/** B01 uses an imported guest plus real OTP; every purchase is a local fixture. */
export async function lumaPurchaseJourney(
  manager: Page,
  visitor: Page,
  browser: Browser,
  signIn: SignInGuest,
) {
  const eventId = new URL(visitor.url()).pathname.split("/")[2];
  const staffUrl = `/admin/events/${eventId}?tab=participation`;
  await manager.setViewportSize({ width: 1440, height: 1000 });
  await manager.goto(staffUrl);
  const sync = (await manager.request
    .get(`/api/admin/events/${eventId}/luma-api`)
    .then((response) => response.json())) as LumaSyncDto;
  const imported = sync.guests.find(
    (guest) => guest.email === "synthetic-one@example.test",
  )!;
  expect(imported).toBeTruthy();
  const endpoint = `/api/admin/events/${eventId}/luma-guests/${imported.id}/purchases`;
  const initial = (await manager.request
    .get(endpoint)
    .then((response) => response.json())) as PurchaseView;
  expect(initial.status).toBe("never");
  expect(initial.orders).toHaveLength(0);
  expect((await visitor.request.get(endpoint)).status()).toBe(401);
  const row = manager
    .getByLabel("Private imported guests", { exact: true })
    .getByRole("listitem")
    .filter({ has: manager.getByText(imported.email, { exact: true }) });
  await row
    .getByRole("button", { name: "Purchase details", exact: true })
    .click();
  const dialog = manager.getByRole("dialog", {
    name: "Guest purchase details",
    exact: true,
  });
  await expect(
    dialog.getByText(/No purchase details have been saved yet/),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Review purchase refresh", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Confirm purchase refresh",
      exact: true,
    }),
  ).toBeDisabled();
  const stillPrivate = (await manager.request
    .get(endpoint)
    .then((response) => response.json())) as PurchaseView;
  expect(stillPrivate.version).toBe(initial.version);
  await dialog
    .getByRole("checkbox", {
      name: "I confirm this guest's purchase refresh.",
      exact: true,
    })
    .check();
  const refreshRequest = manager.waitForRequest(
    (request) =>
      request.url().endsWith(`${endpoint}/refresh`) &&
      request.method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Confirm purchase refresh", exact: true })
    .click();
  await expect(
    dialog.getByText("Purchase details saved.", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog
      .getByRole("region", { name: "Purchased tickets", exact: true })
      .getByText("Synthetic community admission", { exact: true }),
  ).toBeVisible();
  const saved = (await manager.request
    .get(endpoint)
    .then((response) => response.json())) as PurchaseView;
  expect(saved.mode).toBe("fixture");
  expect(saved.status).toBe("observed");
  expect(saved.orders).toHaveLength(1);
  expect(saved.orders[0]).toMatchObject({
    amount: 2500,
    currency: "EUR",
    captured: true,
    state: "captured",
  });
  const replay = await manager.request.post(`${endpoint}/refresh`, {
    headers: { origin: new URL(manager.url()).origin },
    data: (await refreshRequest).postDataJSON(),
  });
  expect(replay.ok()).toBe(true);
  expect((await replay.json()).receiptId).toBe(saved.receiptId);
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();

  await manager.goto(`/admin/events/${eventId}?tab=guests`);
  const access = manager.getByRole("region", {
    name: "Guest portal access",
    exact: true,
  });
  await Promise.all([
    manager
      .waitForEvent("dialog")
      .then((confirmation) => confirmation.accept()),
    access
      .getByRole("button", { name: "Enable Guest portal", exact: true })
      .click(),
  ]);
  await expect(
    access.getByRole("button", { name: "Disable Guest portal", exact: true }),
  ).toBeVisible();
  const option = access
    .getByRole("combobox", { name: "Guest to invite", exact: true })
    .locator("option")
    .filter({ hasText: imported.email });
  await access
    .getByRole("combobox", { name: "Guest to invite", exact: true })
    .selectOption((await option.getAttribute("value"))!);
  await Promise.all([
    manager
      .waitForEvent("dialog")
      .then((confirmation) => confirmation.accept()),
    access
      .getByRole("button", { name: "Grant guest access", exact: true })
      .click(),
  ]);
  await expect(
    access.getByText(
      "Invitation ready. Share the guest portal link; no invitation email has been sent.",
      { exact: true },
    ),
  ).toBeVisible();
  const workspace = (await manager.request
    .get(`/api/admin/events/${eventId}/guests`)
    .then((response) => response.json())) as GuestWorkspace;
  const grant = workspace.grants.find((item) => item.email === imported.email)!;
  expect(grant).toBeTruthy();
  const guestEndpoint = `/api/guest/${eventId}/${grant.id}/purchases`;
  expect((await visitor.request.get(guestEndpoint)).status()).toBe(401);
  expect((await manager.request.get(guestEndpoint)).status()).toBe(404);
  expect((await visitor.request.get(`${guestEndpoint}/receipt`)).status()).toBe(
    401,
  );
  expect((await manager.request.get(`${guestEndpoint}/receipt`)).status()).toBe(
    404,
  );
  const context = await browser.newContext();
  const guest = await context.newPage();
  await signIn(guest, imported.email, "/guest");
  await guest
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(guest).toHaveURL(new RegExp(`/guest/${eventId}/${grant.id}$`));
  const purchases = guest.getByRole("region", {
    name: "Your purchases",
    exact: true,
  });
  await expect(
    purchases.getByText("Synthetic community admission", { exact: true }),
  ).toBeVisible();
  await expect(
    purchases.getByText(/Synthetic purchase example from the local provider/),
  ).toBeVisible();
  await expect(
    purchases
      .getByRole("region", { name: "Purchase orders", exact: true })
      .getByText("€25.00", { exact: true }),
  ).toBeVisible();
  await expect(
    purchases.getByRole("link", {
      name: "Open Luma payment history",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://luma.com/settings/payment");
  const own = await guest.request.get(guestEndpoint);
  expect(own.status()).toBe(200);
  expect(own.headers()["cache-control"]).toContain("no-store");
  expect((await own.json()).receiptId).toBe(saved.receiptId);
  expect((await guest.request.get(endpoint)).status()).toBe(403);
  const summary = await guest.request.get(`${guestEndpoint}/receipt`);
  expect(summary.status()).toBe(200);
  expect(summary.headers()["cache-control"]).toContain("no-store");
  expect(summary.headers()["content-disposition"]).toContain("attachment");
  const downloadPromise = guest.waitForEvent("download");
  await purchases
    .getByRole("link", { name: "Download purchase summary", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("purchase-summary.txt");
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!, "utf8");
  expect(bytes).toContain("Synthetic community admission");
  expect(bytes).not.toContain("synthetic-two@example.test");
  expect(bytes).not.toContain("synthetic-alternative@example.test");
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 320],
  ] as const) {
    await guest.setViewportSize({ width, height: 900 });
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await purchases.screenshot({
      path: `.local/guest-purchases-${device}.png`,
    });
  }
  await context.close();
  await eventEntriesJourney(manager, visitor, eventId, imported.id);
  await eventDrawJourney(manager, visitor, eventId);
  await manager.goto(staffUrl);
}
