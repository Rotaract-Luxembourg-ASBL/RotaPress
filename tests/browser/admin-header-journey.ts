import { expect, type Page } from "@playwright/test";

/** B01's real owner session uses the same private profile as the member portal. */
export async function adminHeaderJourney(owner: Page) {
  await owner.goto("/admin");
  const header = owner.locator(".admin-topbar");
  await expect(
    header.getByText("Fictional Community Club", { exact: true }),
  ).toBeVisible();
  const menu = owner.getByLabel("Open account menu", { exact: true });
  await menu.focus();
  await owner.keyboard.press("Enter");
  await expect(
    owner.getByRole("link", { name: "My profile", exact: true }),
  ).toBeVisible();
  await owner.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await menu.click();
  await owner.getByRole("link", { name: "My profile", exact: true }).click();
  await expect(owner).toHaveURL(/\/membership\?tab=profile$/);
  await owner
    .getByLabel("Display name", { exact: true })
    .fill("Synthetic club owner");
  await owner
    .getByRole("button", { name: "Save profile", exact: true })
    .click();
  await expect(
    owner.getByText("Profile saved.", { exact: true }),
  ).toBeVisible();
  await owner
    .getByRole("link", { name: "Open administration", exact: true })
    .click();
  await expect(header.locator(".admin-account-label strong")).toHaveText(
    "Synthetic club owner",
  );
  await expect(header.locator(".admin-account-label > span")).toHaveText(
    "Owner",
  );
  await owner.reload();
  await expect(header.locator(".admin-account-label strong")).toHaveText(
    "Synthetic club owner",
  );
  expect(await (await owner.request.get("/api/me")).json()).toMatchObject({
    membership: { role: "owner", status: "approved" },
  });

  await owner.setViewportSize({ width: 390, height: 1000 });
  await menu.click();
  await expect(
    owner.getByRole("link", { name: "My profile", exact: true }),
  ).toBeVisible();
  await owner
    .getByRole("heading", { name: "Overview", exact: true })
    .click({ position: { x: 0, y: 10 } });
  await expect(
    owner.getByRole("link", { name: "My profile", exact: true }),
  ).not.toBeVisible();
  const navigation = owner.getByRole("button", {
    name: "Open administration menu",
    exact: true,
  });
  await navigation.click();
  await owner.keyboard.press("Escape");
  await expect(navigation).toBeFocused();
  await navigation.click();
  await owner
    .getByRole("dialog", { name: "Administration menu", exact: true })
    .getByRole("link", { name: "Members", exact: true })
    .click();
  await expect(owner).toHaveURL(/\/admin\/members$/);
  await expect(
    owner.getByRole("dialog", { name: "Administration menu", exact: true }),
  ).toHaveCount(0);
  expect(
    await owner.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await owner.route("**/api/account", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Profile temporarily unavailable." },
    }),
  );
  await owner.reload();
  await menu.click();
  await expect(
    owner.getByText("Your profile could not be loaded.", { exact: false }),
  ).toBeVisible();
  await owner.unroute("**/api/account");
  await owner.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(owner.locator(".admin-account-identity strong")).toHaveText(
    "Synthetic club owner",
  );
  await owner.keyboard.press("Escape");
  await owner.setViewportSize({ width: 1440, height: 1000 });
}
