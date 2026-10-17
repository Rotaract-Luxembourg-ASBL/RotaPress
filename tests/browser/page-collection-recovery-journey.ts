import { expect, type Page, type Route } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import type { PageCollection } from "../../src/features/cms/cms_workspace_schemas";

/** B02: query identity, recoverable quick edits and exact duplicate return state. */
export async function pageCollectionRecoveryJourney(
  page: Page,
  origin: string,
) {
  const post = async <T>(url: string, data: object) => {
    const response = await page.request.post(url, {
      headers: { origin },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as T;
  };
  const prefix = "Collection recovery fixture";
  const alpha = await post<CmsDetail>("/api/admin/cms/content", {
    kind: "page",
    locale: "en",
    title: `${prefix} alpha`,
  });
  await post("/api/admin/cms/content", {
    kind: "page",
    locale: "en",
    title: `${prefix} beta`,
  });
  await page.goto(
    `/admin/website?tab=pages&locale=en&collection=all&sort=title&search=${encodeURIComponent(prefix)}`,
  );
  const workspace = page.getByRole("region", {
    name: "Website pages",
    exact: true,
  });
  const rows = workspace.locator(".page-workspace-row");
  const pagination = workspace.getByLabel("Page list pagination", {
    exact: true,
  });
  await expect(rows).toHaveCount(2);
  await expect(pagination).toContainText("2 matching pages");
  await rows.first().getByRole("checkbox").check();

  // Hold and reject the next query: no previous rows/counts remain actionable.
  let releaseQuery!: () => void;
  let queryStarted!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseQuery = resolve;
  });
  const started = new Promise<void>((resolve) => {
    queryStarted = resolve;
  });
  const missing = `${prefix} missing`;
  const handler = async (route: Route) => {
    if (new URL(route.request().url()).searchParams.get("search") !== missing)
      return route.fallback();
    queryStarted();
    await gate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Collection retry fixture" }),
    });
  };
  await page.route("**/api/admin/cms/pages?**", handler);
  try {
    await workspace
      .getByRole("searchbox", { name: "Search pages" })
      .fill(missing);
    await started;
    await expect(rows).toHaveCount(0);
    await expect(
      workspace.getByRole("checkbox", {
        name: "Select all shown",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(pagination).toHaveCount(0);
    await expect(
      workspace.getByText("1 selected", { exact: true }),
    ).toBeVisible();
    releaseQuery();
    await expect(
      workspace.getByText("Collection retry fixture", { exact: false }),
    ).toBeVisible();
    await expect(rows).toHaveCount(0);
  } finally {
    releaseQuery();
    await page.unroute("**/api/admin/cms/pages?**", handler);
  }
  await workspace.getByRole("searchbox", { name: "Search pages" }).fill(prefix);
  await expect(rows).toHaveCount(2);
  await expect(pagination).toContainText("2 matching pages");
  await expect(rows.first().getByRole("checkbox")).toBeChecked();
  await rows
    .first()
    .getByRole("button", { name: "Quick edit", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: `Quick edit: ${alpha.draft.title}`,
    exact: true,
  });
  const mine = `${prefix} my retained title`;
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill(mine);
  const concurrent = await post<CmsDetail>(
    `/api/admin/cms/content/${alpha.id}/save`,
    {
      locale: "en",
      expectedRevisionId: alpha.draft.id,
      title: `${prefix} concurrent title`,
      slug: alpha.draft.slug,
      description: "Concurrent metadata retained",
      socialImageId: null,
      data: {
        root: { props: {} },
        content: [
          {
            type: "Heading",
            props: {
              id: "concurrent-heading",
              version: 1,
              text: "Concurrent blocks retained",
              level: "h2",
            },
          },
        ],
      },
    },
  );
  const readRow = async () => {
    const collection = (await page.request
      .get(`/api/admin/cms/pages?id=${alpha.id}&locale=en&collection=all`)
      .then((response) => response.json())) as PageCollection;
    return collection.items[0];
  };
  let current = await readRow();
  await post(`/api/admin/cms/content/${alpha.id}/quick-edit`, {
    locale: "en",
    expectedRevisionId: concurrent.draft.id,
    expectedPlacementVersion: current.placementVersion,
    title: concurrent.draft.title,
    slug: concurrent.draft.slug,
    parentId: null,
    position: 7,
  });
  const save = dialog.getByRole("button", {
    name: "Save draft details",
    exact: true,
  });
  const rejectSave = async () => {
    const response = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/admin/cms/content/${alpha.id}/quick-edit`) &&
        response.request().method() === "POST",
    );
    await save.click();
    expect((await response).status()).toBe(409);
    await expect(
      dialog.getByRole("textbox", { name: "Title", exact: true }),
    ).toHaveValue(mine);
    await expect(save).toBeDisabled();
  };
  await rejectSave();
  await dialog
    .getByRole("button", { name: "Compare latest details", exact: true })
    .click();
  const comparison = dialog.getByRole("region", {
    name: "Review changed page details",
    exact: true,
  });
  await expect(comparison).toContainText(`Title: ${concurrent.draft.title}`);
  await expect(comparison).toContainText("Order: 7");
  // A second change after the comparison must still require another review.
  current = await readRow();
  await post(`/api/admin/cms/content/${alpha.id}/quick-edit`, {
    locale: "en",
    expectedRevisionId: current.draftRevisionId,
    expectedPlacementVersion: current.placementVersion,
    title: current.title,
    slug: current.slug,
    parentId: null,
    position: 8,
  });
  await dialog
    .getByRole("button", { name: "Keep my details", exact: true })
    .click();
  await rejectSave();
  await dialog
    .getByRole("button", { name: "Compare latest details", exact: true })
    .click();
  await expect(comparison).toContainText("Order: 8");
  await dialog
    .getByRole("button", { name: "Keep my details", exact: true })
    .click();
  await save.click();
  await expect(dialog).not.toBeVisible();
  const saved = (await page.request
    .get(`/api/admin/cms/content/${alpha.id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  expect(saved.draft.title).toBe(mine);
  expect(saved.draft.data).toEqual(concurrent.draft.data);
  expect(saved.draft.description).toBe(concurrent.draft.description);
  expect((await readRow()).position).toBe(0);

  const returnTo = new URL(page.url()).pathname + new URL(page.url()).search;
  await workspace.getByLabel(`Actions for ${mine}`, { exact: true }).click();
  await workspace
    .getByRole("button", { name: "Duplicate", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/website\/[a-f0-9-]+\?/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(returnTo);
  await page
    .getByRole("link", { name: "Back to Website", exact: true })
    .click();
  await expect(page).toHaveURL(new URL(returnTo, origin).href);
  await expect(pagination).toContainText("3 matching pages");

  // Returning to a long phone collection restores the actual row, after it loads.
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 500 });
  const edit = rows.last().getByRole("link", { name: "Edit", exact: true });
  await edit.scrollIntoViewIfNeeded();
  const top = await edit.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await edit.click();
  await expect(page).toHaveURL(/\/admin\/website\/[a-f0-9-]+\?/);
  await page
    .getByRole("link", { name: "Back to Website", exact: true })
    .click();
  await expect(rows).toHaveCount(3);
  await expect
    .poll(async () =>
      Math.abs(
        (await edit.evaluate(
          (element) => element.getBoundingClientRect().top,
        )) - top,
      ),
    )
    .toBeLessThan(3);
  if (viewport) await page.setViewportSize(viewport);
}
