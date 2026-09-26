import { expect, type Page } from "@playwright/test";
import type { CmsDetail, SiteDraft } from "../../src/features/cms/cms_schemas";
import {
  publishWebsite,
  saveWebsiteSettings,
} from "./website-workspace-journey";

export async function appearanceJourney({
  page,
  publicPage,
  homeId,
  origin,
}: {
  page: Page;
  publicPage: Page;
  homeId: string;
  origin: string;
}) {
  const initial = (await page.request
    .get("/api/admin/cms/site?locale=en")
    .then((response) => response.json())) as SiteDraft;
  const saved = await page.request.patch("/api/admin/cms/site", {
    headers: { origin },
    data: {
      locale: "en",
      expectedVersion: initial.version,
      settings: {
        ...initial.draft,
        navigation: [{ pageId: homeId, label: "Our home" }],
        footerText: "Published footer",
      },
    },
  });
  expect(saved.ok()).toBe(true);
  expect(
    (
      await page.request.post("/api/admin/cms/site/publish", {
        headers: { origin },
        data: {
          locale: "en",
          expectedVersion: ((await saved.json()) as SiteDraft).version,
        },
      })
    ).ok(),
  ).toBe(true);
  const originalContent = (await page.request
    .get(`/api/admin/cms/content/${homeId}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/website?tab=appearance");
  const adminStyle = () =>
    page.locator(".admin-layout").evaluate((root) => {
      const style = getComputedStyle(root);
      const heading = getComputedStyle(root.querySelector("h1")!);
      return {
        background: style.backgroundColor,
        color: style.color,
        font: style.fontFamily,
        columns: style.gridTemplateColumns,
        headingFont: heading.fontFamily,
        headingSize: heading.fontSize,
      };
    });
  const before = await adminStyle();
  await publicPage.goto(`${origin}/pages/en/home`);
  const accent = (target: Page) =>
    target
      .locator(".cms-public")
      .evaluate((root) =>
        getComputedStyle(root).getPropertyValue("--club-accent"),
      );
  const originalAccent = await accent(publicPage);
  await page.getByRole("tab", { name: "Colors & type", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Website theme", exact: true })
    .selectOption("minimal");
  await expect(
    page.getByRole("complementary", { name: "Style preview", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Custom accent color", exact: true })
    .check();
  await page.getByLabel("Accent color", { exact: true }).fill("#713650");
  await expect(
    page.getByRole("textbox", { name: "Hex color", exact: true }),
  ).toHaveValue("#713650");
  await page
    .getByRole("textbox", { name: "Hex color", exact: true })
    .fill("#bad");
  await page.getByRole("tab", { name: "Logo & icon", exact: true }).click();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Hex color", exact: true }),
  ).toBeFocused();
  await expect(
    page
      .getByRole("region", { name: "Website branding and appearance settings" })
      .getByRole("alert"),
  ).toContainText("Enter # and six characters");
  await page
    .getByRole("textbox", { name: "Hex color", exact: true })
    .fill("#365a69");
  await expect(page.getByLabel("Accent color", { exact: true })).toHaveValue(
    "#365a69",
  );
  await page
    .getByRole("textbox", { name: "Hex color", exact: true })
    .fill("#713650");
  await page
    .getByRole("combobox", { name: "Heading style", exact: true })
    .selectOption("serif");
  expect(
    await page
      .getByRole("complementary", { name: "Style preview", exact: true })
      .evaluate((root) => ({
        accent: getComputedStyle(root).getPropertyValue("--club-accent"),
        font: getComputedStyle(root.querySelector("h4")!).fontFamily,
      })),
  ).toEqual({ accent: "#713650", font: "Georgia, serif" });
  expect(await adminStyle()).toEqual(before);
  await expect(
    page.getByRole("link", { name: "Open saved website preview", exact: true }),
  ).toHaveCount(0);
  const navigation = page.getByRole("navigation", {
    name: "Website management",
  });
  await navigation
    .getByRole("button", { name: "Header & footer", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Footer text", exact: true })
    .fill("Reviewed footer and appearance");
  await expect(
    page.getByRole("button", { name: "Publish website", exact: true }),
  ).toBeDisabled();
  await saveWebsiteSettings(page);
  await publicPage.reload();
  expect(await accent(publicPage)).toBe(originalAccent);
  await expect(
    publicPage.getByText("Published footer", { exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByText("Reviewed footer and appearance", { exact: true }),
  ).toHaveCount(0);
  await publicPage.goto("/admin/website/preview?locale=en");
  await expect(publicPage).toHaveURL(/\/sign-in/);
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("link", { name: "Preview website", exact: true })
    .click();
  const preview = await popup;
  expect(
    (await page.request.get("/admin/website/preview?locale=en")).headers()[
      "cache-control"
    ],
  ).toMatch(/no-store/);
  await expect(preview.locator(".cms-public")).toBeVisible();
  expect(await accent(preview)).toBe("#713650");
  await expect(
    preview.getByText("Reviewed footer and appearance", { exact: true }),
  ).toBeVisible();
  await expect(preview.locator(".admin-sidebar")).toHaveCount(0);
  await expect(
    preview.getByText(
      "Private website preview. Visitors still see the published website.",
      { exact: true },
    ),
  ).toBeVisible();
  await preview.screenshot({
    path: ".local/theme-preview-desktop.png",
    fullPage: true,
  });
  await preview.close();
  await publishWebsite(page);
  expect(await adminStyle()).toEqual(before);
  await navigation
    .getByRole("button", { name: "Branding & appearance", exact: true })
    .click();
  await page.getByRole("tab", { name: "Colors & type", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local/theme-settings-desktop.png",
    fullPage: true,
  });
  await publicPage.setViewportSize({ width: 1440, height: 1000 });
  await publicPage.goto(`${origin}/pages/en/home`);
  expect(await accent(publicPage)).toBe("#713650");
  await expect(
    publicPage.getByRole("link", { name: "Our home", exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByText("Reviewed footer and appearance", { exact: true }),
  ).toBeVisible();
  await publicPage.screenshot({
    path: ".local/theme-custom-desktop.png",
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await publicPage.setViewportSize({ width, height: 844 });
    expect(
      await publicPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      await publicPage.screenshot({
        path: ".local/theme-custom-phone.png",
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/theme-settings-phone.png",
    fullPage: true,
  });
  await page
    .getByText("Restore a previous appearance", { exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Restore previous appearance to draft",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "Previous appearance restored to draft. Review and publish the website when ready.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Website theme", exact: true }),
  ).toHaveValue(initial.draft.themeId);
  await publicPage.reload();
  expect(await accent(publicPage)).toBe("#713650");
  await publishWebsite(page);
  await publicPage.reload();
  expect(await accent(publicPage)).toBe(originalAccent);
  // Group publication never creates a new page revision for unchanged content.
  expect(
    await page.request
      .get(`/api/admin/cms/content/${homeId}?locale=en`)
      .then((response) => response.json()),
  ).toEqual(originalContent);
  await page
    .getByRole("combobox", { name: "Website section", exact: true })
    .selectOption("pages");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New page", exact: true });
  await dialog
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Editable template copy");
  await dialog
    .getByRole("textbox", { name: /^URL slug/ })
    .fill("editable-template");
  await dialog
    .getByRole("combobox", { name: /^Page layout/ })
    .selectOption("about");
  await dialog
    .getByRole("button", { name: "Create draft", exact: true })
    .click();
  await expect(page.locator(".editor-toolbar")).toBeVisible();
  await expect(page.locator(".cms-puck .cms-hero h1")).toHaveText(
    "A little about us.",
  );
  expect(
    (
      await publicPage.request.get(`${origin}/pages/en/editable-template`)
    ).status(),
  ).toBe(404);
}
