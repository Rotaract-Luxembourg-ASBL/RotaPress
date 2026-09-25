import { expect, type Page } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";

/** B02 continuation: metadata uses the existing private revision and publication workflow. */
export async function pageSettingsJourney(
  page: Page,
  visitor: Page,
  id: string,
) {
  const original = (await (
    await page.request.get(`/api/admin/cms/content/${id}?locale=en`)
  ).json()) as CmsDetail;
  const draft = original.draft;
  const title = "Community welcome";
  const description =
    "A private draft description for our community welcome page.";
  const newSlug = "community-welcome";
  const oldPath = `/pages/en/${draft.slug}`;
  const newPath = `/pages/en/${newSlug}`;
  const publicDescription = () =>
    visitor.evaluate(
      () =>
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") ?? "",
    );
  await page.locator(".editor-canvas .cms-hero h1").click();
  await expect(
    page.getByRole("tab", { name: "Block", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("More page actions", { exact: true }).click();
  await page.locator(".editor-canvas-toolbar > span").click();
  await expect(page.locator(".editor-more")).not.toHaveAttribute("open");
  await page.getByLabel("More page actions", { exact: true }).click();
  await page
    .getByRole("button", { name: "Page settings & SEO", exact: true })
    .click();
  await expect(page.getByLabel("Page title", { exact: true })).toBeFocused();
  await expect(page.locator(".editor-more")).not.toHaveAttribute("open");
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Page settings", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Page", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Edit page name and title", exact: true })
    .click();
  await expect(page.getByLabel("Page title", { exact: true })).toBeFocused();
  await page.getByLabel("Page title", { exact: true }).fill(title);
  await page.getByLabel("URL slug", { exact: true }).fill(newSlug);
  await page
    .getByRole("textbox", { name: "SEO description", exact: true })
    .fill(description);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Page title", { exact: true })).toHaveValue(
    title,
  );
  await expect(page.getByLabel("URL slug", { exact: true })).toHaveValue(
    newSlug,
  );
  await expect(
    page.getByRole("textbox", { name: "SEO description", exact: true }),
  ).toHaveValue(description);
  await visitor.goto(oldPath);
  await expect(visitor).toHaveTitle(new RegExp(draft.title));
  await expect.poll(publicDescription).toBe(draft.description);
  expect((await visitor.request.get(newPath)).status()).toBe(404);
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page
      .getByRole("button", { name: "Page settings", exact: true })
      .click();
    await expect(page.getByLabel("Page title", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "SEO description", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `.local/page-settings-${device}.png` });
  }
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByText("Published. The website now shows this saved revision."),
  ).toBeVisible();
  await visitor.goto(newPath);
  await expect(visitor).toHaveTitle(`${title} | Synthetic CMS Club`);
  await expect(visitor.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    description,
  );
  await expect(visitor.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    `${title} | Synthetic CMS Club`,
  );
  await expect(visitor.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    new RegExp(`${newPath}$`),
  );
  expect((await visitor.request.get(oldPath)).status()).toBe(404);
  await page.getByLabel("More page actions", { exact: true }).click();
  await page.getByRole("button", { name: /Revision history/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "Revision history",
    exact: true,
  });
  await dialog
    .getByRole("listitem")
    .filter({ has: page.getByText(draft.title, { exact: true }) })
    .first()
    .getByRole("button", { name: "Restore to draft", exact: true })
    .click();
  // Restoring resets the canvas and closes its revision dialog.
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Page settings", exact: true })
    .click();
  await expect(page.getByLabel("Page title", { exact: true })).toHaveValue(
    draft.title,
  );
  await expect(
    page.getByRole("textbox", { name: "SEO description", exact: true }),
  ).toHaveValue(draft.description);
  await visitor.reload();
  await expect(visitor).toHaveTitle(new RegExp(title));
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByText("Published. The website now shows this saved revision."),
  ).toBeVisible();
  await visitor.goto(oldPath);
  await expect(visitor).toHaveTitle(new RegExp(draft.title));
  await expect.poll(publicDescription).toBe(draft.description);
  await page.setViewportSize({ width: 1440, height: 1000 });
}
