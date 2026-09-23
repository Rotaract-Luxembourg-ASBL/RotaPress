import { expect, type Page } from "@playwright/test";
import type { FormDto } from "../../src/features/forms/form_types";
import type { PartnerDto } from "../../src/features/partners/partner_schemas";

/** Extends B02: real collection counts, recoverable filters and mobile actions. */
export async function adminCollectionsJourney(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/forms");
  const { forms } = (await page.request
    .get("/api/admin/forms")
    .then((r) => r.json())) as { forms: FormDto[] };
  const published = forms.filter(
    (form) => !form.archived && form.publishedVersionId,
  );
  const stats = page.getByRole("region", { name: "Form counts", exact: true });
  await expect(
    stats.getByRole("button", { name: /^Published/ }).locator("strong"),
  ).toHaveText(String(published.length));
  await stats.getByRole("button", { name: /^Published/ }).click();
  const library = page.getByRole("region", { name: "Your forms", exact: true });
  await expect(library.getByRole("listitem")).toHaveCount(published.length);
  const search = library.getByRole("searchbox", {
    name: "Search forms",
    exact: true,
  });
  await search.fill("no matching form qzxw");
  await expect(
    library.getByRole("heading", { name: "No forms to show" }),
  ).toBeVisible();
  await library
    .getByRole("button", { name: "Clear filters", exact: true })
    .first()
    .click();
  await expect(library.getByRole("listitem")).toHaveCount(
    forms.filter((form) => !form.archived).length,
  );

  const editable = forms.find((form) => !form.archived)!;
  const row = library.getByRole("listitem").filter({
    has: page.getByRole("link", { name: editable.draft.title, exact: true }),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const actions = row.getByLabel(`Actions for ${editable.draft.title}`, {
    exact: true,
  });
  await actions.focus();
  await actions.press("Enter");
  const menu = row.getByRole("group", {
    name: `Actions for ${editable.draft.title} options`,
    exact: true,
  });
  await expect(
    menu.getByRole("button", { name: "Archive form", exact: true }),
  ).toBeVisible();
  expect(
    await menu.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth;
    }),
  ).toBe(true);
  await actions.press("Escape");
  await expect(menu).toBeHidden();
  await expect(actions).toBeFocused();
  await row.getByRole("link", { name: "Edit form", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/forms/${editable.id}$`));
  await page.getByRole("link", { name: "All forms", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Forms", exact: true }),
  ).toBeVisible();

  await page.goto("/admin/partners");
  const { items } = (await page.request
    .get("/api/admin/partners")
    .then((r) => r.json())) as { items: PartnerDto[] };
  await page
    .getByRole("group", { name: "Directory categories" })
    .getByRole("button", { name: /^Sponsors/ })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Directory profiles" })
      .getByRole("listitem"),
  ).toHaveCount(
    items.filter((item) => item.draft.category === "sponsor").length,
  );
  await page
    .getByRole("searchbox", { name: "Search profiles" })
    .fill("no matching profile qzxw");
  await expect(
    page.getByRole("heading", { name: "No matching profiles" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .first()
    .click();
  await expect(
    page
      .getByRole("region", { name: "Directory profiles" })
      .getByRole("listitem"),
  ).toHaveCount(items.length);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin");
  await expect(
    page
      .getByRole("region", { name: "Forms overview", exact: true })
      .getByRole("definition")
      .first(),
  ).toHaveText(String(published.length));
}
