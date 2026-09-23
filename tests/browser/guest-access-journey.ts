import { randomUUID } from "node:crypto";
import { expect, type Page, type Browser } from "@playwright/test";
import { smokeOrigin as origin } from "../../scripts/smoke_origin.mjs";
import type { GuestWorkspace } from "../../src/features/guests/guest_schemas";

export type SignInGuest = (
  page: Page,
  email: string,
  next: string,
) => Promise<void>;

/** Two additional real OTP identities; no membership, forged session or browser role. */
export async function guestAccessJourney(
  manager: Page,
  browser: Browser,
  eventId: string,
  signIn: SignInGuest,
) {
  const firstContext = await browser.newContext(),
    secondContext = await browser.newContext();
  const anonymous = await browser.newContext();
  const first = await firstContext.newPage(),
    second = await secondContext.newPage();
  const names = ["Synthetic Guest One", "Synthetic Guest Two"];
  const emails = names.map(() => `portal-${randomUUID()}@example.test`);
  const panels = manager.getByRole("region", {
    name: "Guest portal access",
    exact: true,
  });
  const administrationStyle = () =>
    manager.locator(".event-studio").evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        font: style.fontFamily,
        color: style.color,
        background: style.backgroundColor,
      };
    });
  await manager.goto(`/admin/events/${eventId}?tab=participation`);
  const styleBefore = await administrationStyle();
  const registration = manager.getByRole("region", {
    name: "Event forms and registration",
    exact: true,
  });
  await registration
    .getByRole("spinbutton", { name: "Capacity", exact: true })
    .fill("3");
  manager.once("dialog", (d) => d.accept());
  await registration
    .getByRole("button", { name: "Save registration settings", exact: true })
    .click();
  await expect(
    registration.getByText("0 confirmed of 3 places · Open", { exact: true }),
  ).toBeVisible();
  for (const [index, page] of [first, second].entries()) {
    await signIn(page, emails[index], "/guest");
    await expect(
      page.getByText(/No available invitations for this account/),
    ).toBeVisible();
    await page.goto(`/events/${eventId}/en/registration`);
    await page
      .getByRole("textbox", { name: "Your name", exact: false })
      .fill(names[index]);
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await expect(
      page.getByText("Your place is confirmed.", { exact: true }),
    ).toBeVisible();
    expect((await page.request.get("/api/admin/members")).status()).toBe(403);
    expect(
      (await page.request.get(`/api/admin/events/${eventId}/guests`)).status(),
    ).toBe(403);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/membership$/);
  }
  await manager.goto(`/admin/events/${eventId}?tab=guests`);
  manager.once("dialog", (d) => d.accept());
  await panels
    .getByRole("button", { name: "Enable Guest portal", exact: true })
    .click();
  await expect(
    panels.getByRole("button", { name: "Disable Guest portal", exact: true }),
  ).toBeVisible();
  const ids: string[] = [];
  for (const email of emails) {
    const option = panels
      .getByRole("combobox", { name: "Guest to invite" })
      .locator("option")
      .filter({ hasText: email });
    await panels
      .getByRole("combobox", { name: "Guest to invite" })
      .selectOption((await option.getAttribute("value"))!);
    manager.once("dialog", (d) => d.accept());
    await panels
      .getByRole("button", { name: "Grant guest access", exact: true })
      .click();
    await expect(
      panels.getByText(email, { exact: true }).first(),
    ).toBeVisible();
    const workspace: GuestWorkspace = await manager.request
      .get(`/api/admin/events/${eventId}/guests`)
      .then((r) => r.json());
    ids.push(workspace.grants.find((g) => g.email === email)!.id);
  }
  const route = (index: number) => `/api/guest/${eventId}/${ids[index]}`;
  const denied = await anonymous.request.get(`${origin}${route(0)}`);
  expect(denied.status()).toBe(401);
  expect(denied.headers()["cache-control"]).toContain("no-store");
  expect(
    (
      await second.request.post(`${route(0)}/claim`, {
        headers: { origin },
        data: { confirmed: true },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await first.request.post(`${route(0)}/claim`, {
        headers: { origin: "https://untrusted.example" },
        data: { confirmed: true },
      })
    ).status(),
  ).toBe(403);
  for (const [index, page] of [first, second].entries()) {
    await page.goto(
      index === 0 ? "/membership?tab=bookings&view=invitations" : "/guest",
    );
    await expect(
      page.getByRole("button", { name: "Accept invitation", exact: true }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(page).toHaveURL(
      index === 0
        ? new RegExp(
            `/membership\\?tab=bookings&event=${eventId}&invitation=${ids[index]}$`,
          )
        : new RegExp(`/guest/${eventId}/${ids[index]}$`),
    );
    await expect(
      page.getByRole("region", { name: "Your booking", exact: true }),
    ).toBeVisible();
    const own = await page.request.get(route(index));
    expect(own.status()).toBe(200);
    expect(own.headers()["cache-control"]).toContain("no-store");
    expect((await page.request.get(route(index ? 0 : 1))).status()).toBe(404);
    expect(JSON.stringify(await own.json())).not.toMatch(
      /recipientEmail|userId|submissionId|answers/,
    );
  }
  await panels
    .getByRole("button", { name: "Refresh invitations", exact: true })
    .click();
  await expect(
    panels.getByText("Registration · claimed", { exact: true }),
  ).toHaveCount(2);
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await first.setViewportSize({ width, height: 900 });
    expect(
      await first.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await first.screenshot({
      path: `.local/guest-portal-${device}.png`,
      fullPage: true,
    });
    await manager.setViewportSize({ width, height: 1000 });
    expect(
      await manager.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panels.screenshot({
      path: `.local/guest-access-admin-${device}.png`,
    });
  }
  // Client guest CSS must not change administration after navigation in the same tab.
  await manager.goto("/guest");
  await manager.goto(`/admin/events/${eventId}?tab=guests`);
  expect(await administrationStyle()).toEqual(styleBefore);
  manager.once("dialog", (d) => d.accept());
  await panels
    .getByRole("button", { name: "Disable Guest portal", exact: true })
    .click();
  await expect(
    panels.getByRole("button", { name: "Enable Guest portal", exact: true }),
  ).toBeVisible();
  expect((await first.request.get(route(0))).status()).toBe(404);
  await first.reload();
  await expect(first.getByRole("region", { name: "Your booking" })).toHaveCount(
    0,
  );
  manager.once("dialog", (d) => d.accept());
  await panels
    .getByRole("button", { name: "Enable Guest portal", exact: true })
    .click();
  await expect(
    panels.getByRole("button", { name: "Disable Guest portal", exact: true }),
  ).toBeVisible();
  expect((await first.request.get(route(0))).status()).toBe(200);
  manager.once("dialog", (d) => d.accept());
  await panels
    .getByRole("button", {
      name: `Revoke access for ${emails[0]}`,
      exact: true,
    })
    .click();
  await expect(
    panels.getByText("Guest access revoked. Their booking is retained.", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await first.request.get(route(0))).status()).toBe(404);
  expect((await second.request.get(route(1))).status()).toBe(200);
  for (const page of [first, second]) {
    await page.goto("/registrations");
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Cancel registration", exact: true })
      .click();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  }
  expect((await second.request.get(route(1))).status()).toBe(404);
  await firstContext.close();
  await secondContext.close();
  await anonymous.close();
}
