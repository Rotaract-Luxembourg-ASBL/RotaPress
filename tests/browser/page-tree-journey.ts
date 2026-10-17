import { expect, type Page } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";

/** B02: keyboard-operable hierarchy changes preserve drafts, addresses and return state. */
export async function pageTreeJourney(
  page: Page,
  parent: CmsDetail,
  child: CmsDetail,
) {
  await page.getByRole("button", { name: "Page tree", exact: true }).click();
  const tree = page.getByRole("region", {
    name: "Page hierarchy",
    exact: true,
  });
  const siblings = tree.getByRole("list", {
    name: "Top-level pages",
    exact: true,
  });
  const pager = tree.getByRole("navigation", {
    name: "Top-level pages pages",
    exact: true,
  });
  async function findRoot(title: string) {
    const link = siblings.getByRole("link", { name: title, exact: true });
    await expect(siblings).toBeVisible();
    for (
      let attempt = 0;
      attempt < 100 &&
      (await pager.isVisible()) &&
      (await pager
        .getByRole("button", { name: "Previous", exact: true })
        .isEnabled());
      attempt++
    ) {
      await pager
        .getByRole("button", { name: "Previous", exact: true })
        .click();
      await expect(siblings).toBeVisible();
    }
    for (
      let attempt = 0;
      attempt < 100 && (await link.count()) === 0;
      attempt++
    ) {
      await expect(
        pager.getByRole("button", { name: "Next", exact: true }),
      ).toBeEnabled();
      await pager.getByRole("button", { name: "Next", exact: true }).click();
      await expect(siblings).toBeVisible();
    }
    await expect(link).toBeVisible();
  }
  const before = (await page.request
    .get(`/api/admin/cms/content/${child.id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  await findRoot(child.draft.title);
  await tree
    .getByRole("button", { name: `Move ${child.draft.title}`, exact: true })
    .click();
  await findRoot(parent.draft.title);
  await tree
    .getByRole("button", {
      name: `Place inside ${parent.draft.title}`,
      exact: true,
    })
    .click();
  await tree.getByRole("button", { name: "Move page", exact: true }).click();
  const children = tree.getByRole("list", {
    name: `Children of ${parent.draft.title}`,
    exact: true,
  });
  const childLink = children.getByRole("link", {
    name: child.draft.title,
    exact: true,
  });
  await expect(childLink).toBeVisible();
  const after = (await page.request
    .get(`/api/admin/cms/content/${child.id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  expect(after.draft.id).toBe(before.draft.id);
  expect(after.draft.slug).toBe(before.draft.slug);
  await childLink.click();
  await page
    .getByRole("link", { name: "Back to Website", exact: true })
    .click();
  await expect(page).toHaveURL(/view=tree/);
  await expect(childLink).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page).toHaveURL(/search=Workspace/);
}
