import { expect, type Page } from "@playwright/test";

/** B02's existing real owner session; all changes target the disposable test club. */
export async function clubFeaturesJourney(page: Page, visitor: Page) {
  const endpoint = "/api/admin/integrations/features";
  expect((await visitor.request.get(endpoint)).status()).toBe(401);
  expect(
    (
      await page.request.post(endpoint, {
        headers: { origin: "https://untrusted.example" },
        data: {
          key: "events",
          enabled: false,
          expectedVersion: 0,
          confirmed: true,
        },
      })
    ).status(),
  ).toBe(403);
  const snapshot = async () =>
    Promise.all(
      ["/api/admin/forms", "/api/admin/events", "/api/admin/cms/content"].map(
        async (path) => (await page.request.get(path)).json(),
      ),
    );
  const before = await snapshot();
  await page.goto("/admin/integrations");
  await expect(
    page.getByRole("article", { name: "Forms", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Events", exact: true }),
  ).toBeVisible();
  const adminStyle = await page.locator(".admin-sidebar").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      font: style.fontFamily,
      color: style.color,
      background: style.backgroundColor,
    };
  });
  async function toggle(name: "Forms" | "Events", enabled: boolean) {
    await page
      .getByRole("button", {
        name: `${enabled ? "Enable" : "Disable"} ${name}`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: `Review ${name} availability`,
    });
    const confirm = dialog.getByRole("button", {
      name: `Confirm ${name} availability`,
      exact: true,
    });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await confirm.click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page
        .getByRole("article", { name, exact: true })
        .getByText(enabled ? "Enabled" : "Disabled", { exact: true }),
    ).toBeVisible();
  }
  await toggle("Forms", false);
  const navigation = page.getByRole("navigation", {
    name: "Administration",
    exact: true,
  });
  await expect(
    navigation.getByRole("link", { name: "Forms", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/admin/forms")).status()).toBe(409);
  await page.goto("/admin/forms");
  await expect(
    page.getByRole("heading", { name: "Forms is disabled" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Manage features", exact: true })
    .click();
  await toggle("Events", false);
  await expect(
    navigation.getByRole("link", { name: "Events", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/admin/events")).status()).toBe(409);
  expect((await visitor.request.get("/events")).status()).toBe(404);
  expect((await visitor.request.get("/")).status()).toBe(200);
  await page.goto("/admin");
  await expect(
    page.getByRole("region", { name: "Events overview", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Forms overview", exact: true }),
  ).toHaveCount(0);
  await page.goto("/admin/integrations");
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.getByRole("button", { name: "Enable Events", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/club-features-${device}.png`,
      fullPage: true,
      mask: [page.locator(".admin-account")],
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await toggle("Events", true);
  await toggle("Forms", true);
  await expect(
    navigation.getByRole("link", { name: "Forms", exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Events", exact: true }),
  ).toBeVisible();
  expect(await snapshot()).toEqual(before);
  expect(
    await page.locator(".admin-sidebar").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        font: style.fontFamily,
        color: style.color,
        background: style.backgroundColor,
      };
    }),
  ).toEqual(adminStyle);
  expect((await visitor.request.get("/events")).status()).toBe(200);
}
