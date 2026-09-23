import { expect, type Page } from "@playwright/test";

/** Uses B01's actual email-OTP member session, without staff privileges. */
export async function memberWorkspaceJourney(member: Page) {
  const me = await member.request.get("/api/me");
  expect(await me.json()).toMatchObject({
    membership: { status: "approved", role: "member" },
    capabilities: [],
  });
  for (const path of [
    "/admin",
    "/admin/settings",
    "/admin/events",
    "/admin/website",
  ]) {
    await member.goto(path);
    await expect(member).toHaveURL(/\/membership$/);
    await expect(member.locator(".admin-layout")).toHaveCount(0);
  }
  await member.goto("/membership");
  await expect(member.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  await expect(
    member.getByRole("link", { name: "Open administration", exact: true }),
  ).toHaveCount(0);
  const navigation = member.getByRole("navigation", {
    name: "Member account",
    exact: true,
  });
  await expect(
    member.getByRole("button", {
      name: "Refresh membership status",
      exact: true,
    }),
  ).toHaveCount(0);
  await navigation
    .getByRole("link", { name: "My profile", exact: true })
    .click();
  await member
    .getByLabel("Display name", { exact: true })
    .fill("Synthetic community member");
  await member
    .getByRole("textbox", { name: "Interests and skills", exact: true })
    .fill("Community gardening");
  member.once("dialog", (dialog) => dialog.dismiss());
  await navigation.getByRole("link", { name: "Home", exact: true }).click();
  await expect(
    member.getByRole("textbox", { name: "Interests and skills", exact: true }),
  ).toHaveValue("Community gardening");
  await member
    .getByRole("button", { name: "Save profile", exact: true })
    .click();
  await expect(
    member.getByText("Profile saved.", { exact: true }),
  ).toBeVisible();
  await member.reload();
  await expect(member.getByLabel("Display name", { exact: true })).toHaveValue(
    "Synthetic community member",
  );
  await navigation.getByRole("link", { name: "Home", exact: true }).click();
  await expect(
    member.getByRole("heading", {
      name: "Welcome, Synthetic community member.",
      exact: true,
    }),
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await member.setViewportSize({ width, height: 1000 });
    expect(
      await member.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await member.screenshot({
      path: `.local/member-space-${width === 1440 ? "desktop" : "phone"}.png`,
      fullPage: true,
      mask: [member.locator(".account-email")],
    });
  }
  const menu = member.getByRole("button", {
    name: "Open member menu",
    exact: true,
  });
  await menu.click();
  await member.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await menu.click();
  await navigation
    .getByRole("link", { name: "My bookings", exact: true })
    .click();
  await expect(
    member.getByRole("dialog", { name: "Member menu", exact: true }),
  ).toHaveCount(0);
  await expect(
    member.getByRole("heading", { name: "My registrations", exact: true }),
  ).toBeVisible();
  await member
    .getByRole("link", { name: "Event invitations", exact: true })
    .click();
  await expect(
    member.getByText(/No available invitations for this account/),
  ).toBeVisible();
  await member.goto("/membership?tab=calendar");
  await expect(
    member.getByRole("region", { name: "Community calendar", exact: true }),
  ).toBeVisible();
  await member
    .getByRole("link", { name: "Email & reminders", exact: true })
    .click();
  await expect(
    member.getByRole("region", { name: "Calendar subscriptions", exact: true }),
  ).toBeVisible();
  await member.route("**/api/account", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Account temporarily unavailable." },
    }),
  );
  await member.goto("/membership?tab=responses");
  await expect(
    member
      .getByText("Account temporarily unavailable.", { exact: false })
      .first(),
  ).toBeVisible();
  await member.unroute("**/api/account");
  await member.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    member.getByRole("heading", { name: "No responses yet", exact: true }),
  ).toBeVisible();
  await member.goto("/");
  await expect(
    member
      .locator("header")
      .getByRole("link", { name: "My account", exact: true }),
  ).toBeVisible();
  await expect(
    member
      .locator("header")
      .getByRole("link", { name: "Member login", exact: true }),
  ).toHaveCount(0);
  await member.goto("/sign-in?next=/membership");
  await expect(
    member.getByRole("textbox", { name: "Email address", exact: true }),
  ).toHaveCount(0);
  await expect(member.getByRole("link", { name: /Continue/ })).toBeVisible();
  expect((await member.request.get("/api/admin/settings")).status()).toBe(403);
  await member.setViewportSize({ width: 1440, height: 1000 });
}

export async function domainSettingsJourney(owner: Page, origin: string) {
  await owner.goto("/admin/settings?tab=domains");
  await expect(
    owner.getByRole("heading", { name: "Your website address", exact: true }),
  ).toBeVisible();
  await owner
    .getByLabel("Domain name", { exact: true })
    .fill("synthetic-club.example.org");
  await owner.getByRole("button", { name: "Add domain", exact: true }).click();
  await expect(
    owner.getByLabel("TXT record name", { exact: true }),
  ).toHaveValue("_rotapress.synthetic-club.example.org");
  await expect(
    owner.getByText("Awaiting DNS verification", { exact: true }),
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await owner.setViewportSize({ width, height: 1000 });
    expect(
      await owner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await owner.screenshot({
      path: `.local/domain-settings-${width === 1440 ? "desktop" : "phone"}.png`,
      fullPage: true,
      mask: [
        owner.locator(".admin-account"),
        owner.getByLabel("TXT record value", { exact: true }),
      ],
    });
  }
  expect(
    (
      await owner.request.get("/api/me", {
        headers: { origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.request.fetch("/api/me", {
        method: "OPTIONS",
        headers: { origin },
      })
    ).status(),
  ).toBe(204);
  expect(
    (
      await owner.request.fetch("/api/me", {
        method: "OPTIONS",
        headers: { origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  await owner.setViewportSize({ width: 1440, height: 1000 });
}
