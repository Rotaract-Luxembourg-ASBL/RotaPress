import { expect, type Page, type Route } from "@playwright/test";
import type { AlbumDetail } from "../../src/features/media/album_schemas";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";

/** B02: failed album switches cannot display another album, and copied placements stay independent. */
export async function albumPlacementJourney(page: Page, original: AlbumDetail) {
  const origin = new URL(page.url()).origin;
  const returnTo = new URL(page.url()).pathname + new URL(page.url()).search;
  const mutate = async <T>(url: string, data: object, method = "POST") => {
    const response = await page.request.fetch(url, {
      method,
      headers: { origin },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as T;
  };
  let alternate = await mutate<AlbumDetail>("/api/admin/media/albums", {
    ...original.published,
    title: "Alternate album preview",
    items: original.published!.items.map((item) => ({
      ...item,
      caption: "Alternate album photograph",
    })),
  });
  alternate = await mutate<AlbumDetail>(
    `/api/admin/media/albums/${alternate.id}/publication`,
    { expectedVersion: alternate.version },
  );
  let content = await mutate<CmsDetail>("/api/admin/cms/content", {
    kind: "page",
    locale: "en",
    title: "Independent album copy",
    slug: "independent-album-copy",
    templateId: "blank",
  });
  content = await mutate<CmsDetail>(
    `/api/admin/cms/content/${content.id}/save`,
    {
      locale: "en",
      expectedRevisionId: content.draft.id,
      title: content.draft.title,
      slug: content.draft.slug,
      description: "",
      socialImageId: null,
      data: {
        root: { props: {} },
        content: ["copy", "linked"].map((id) => ({
          type: "Gallery",
          props: {
            id,
            version: 1,
            albumId: original.id,
            items: [],
          },
        })),
      },
    },
  );
  await page.goto(`/admin/website/${content.id}?locale=en`);
  const canvas = page.frameLocator(".editor-canvas iframe");
  const originalCaption = original.published!.items[0].caption;
  await expect(canvas.getByText(originalCaption, { exact: true })).toHaveCount(
    2,
  );
  await canvas.getByText(originalCaption, { exact: true }).first().click();
  const source = page.getByRole("combobox", {
    name: "Gallery source",
    exact: true,
  });
  await expect(source).toHaveValue(original.id);

  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pattern = `**/api/admin/media/albums/${alternate.id}`;
  const fail = async (route: Route) => {
    started();
    await gate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Album preview recovery fixture" }),
    });
  };
  await page.route(pattern, fail);
  try {
    await source.selectOption(alternate.id);
    await requested;
    await expect(
      canvas.getByText("Loading linked album…", { exact: true }),
    ).toBeVisible();
    await expect(
      canvas.getByText(originalCaption, { exact: true }),
    ).toHaveCount(1);
    release();
    await expect(canvas.getByRole("alert")).toHaveText(
      "Album preview recovery fixture",
    );
    await expect(
      canvas.getByText(originalCaption, { exact: true }),
    ).toHaveCount(1);
  } finally {
    release();
    await page.unroute(pattern, fail);
  }
  await page
    .getByRole("button", { name: "Refresh album preview", exact: true })
    .click();
  await expect(
    canvas.getByText("Alternate album photograph", { exact: true }),
  ).toBeVisible();
  await expect(canvas.getByRole("alert")).toHaveCount(0);
  await source.selectOption(original.id);
  await expect(canvas.getByText(originalCaption, { exact: true })).toHaveCount(
    2,
  );
  // Fail again after a successful retry, then recover by leaving and returning.
  await page.route(pattern, fail);
  try {
    await source.selectOption(alternate.id);
    await expect(canvas.getByRole("alert")).toHaveText(
      "Album preview recovery fixture",
    );
  } finally {
    await page.unroute(pattern, fail);
  }
  await source.selectOption(original.id);
  await expect(canvas.getByText(originalCaption, { exact: true })).toHaveCount(
    2,
  );
  await expect(canvas.getByRole("alert")).toHaveCount(0);
  await source.selectOption(alternate.id);
  await expect(
    canvas.getByText("Alternate album photograph", { exact: true }),
  ).toBeVisible();
  await source.selectOption(original.id);
  await expect(canvas.getByText(originalCaption, { exact: true })).toHaveCount(
    2,
  );
  await page
    .getByRole("button", { name: "Convert to independent copy", exact: true })
    .click();
  await expect(source).toHaveValue("");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  content = (await page.request
    .get(`/api/admin/cms/content/${content.id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  expect(content.draft.data.content[0]).toMatchObject({
    type: "Gallery",
    props: { items: original.published!.items },
  });
  expect(content.draft.data.content[0].props).not.toHaveProperty("albumId");
  expect(content.draft.data.content[1]).toMatchObject({
    type: "Gallery",
    props: { albumId: original.id },
  });
  await mutate(`/api/admin/cms/content/${content.id}/publish`, {
    locale: "en",
    expectedRevisionId: content.draft.id,
  });

  const publicTab = await page.context().newPage();
  try {
    await publicTab.goto(`/pages/en/${content.draft.slug}`);
    await expect(
      publicTab.getByText(originalCaption, { exact: true }),
    ).toHaveCount(2);
    const updated = await mutate<AlbumDetail>(
      `/api/admin/media/albums/${original.id}`,
      {
        expectedVersion: original.version,
        data: {
          ...original.draft,
          items: original.draft.items.map((item) => ({
            ...item,
            caption: "Updated linked source photograph",
          })),
        },
      },
      "PATCH",
    );
    await mutate(`/api/admin/media/albums/${original.id}/publication`, {
      expectedVersion: updated.version,
    });
    await publicTab.reload();
    await expect(
      publicTab.getByText(originalCaption, { exact: true }),
    ).toHaveCount(1);
    await expect(
      publicTab.getByText("Updated linked source photograph", { exact: true }),
    ).toHaveCount(1);
  } finally {
    await publicTab.close();
  }
  await page.goto(returnTo);
}

/** Exercise real second-page navigation, saved query and dialog return state. */
export async function albumLocationJourney(page: Page) {
  const origin = new URL(page.url()).origin;
  const prefix = "Album navigation fixture";
  for (let index = 0; index < 25; index++) {
    const response = await page.request.post("/api/admin/media/albums", {
      headers: { origin },
      data: { title: `${prefix} ${index}`, items: [] },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  const search = page.getByRole("searchbox", {
    name: "Search albums",
    exact: true,
  });
  await search.fill(prefix);
  await expect(page.locator(".media-album-card")).toHaveCount(24);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".media-album-card")).toHaveCount(1);
  await page.locator(".media-album-card").click();
  await expect(page).toHaveURL(/album=/);
  const editor = page.getByRole("dialog", {
    name: "Edit photo album",
    exact: true,
  });
  await expect(editor).toBeVisible();
  const title = await editor
    .getByLabel("Album title", { exact: true })
    .inputValue();
  await page.reload();
  await expect(editor.getByLabel("Album title", { exact: true })).toHaveValue(
    title,
  );
  await editor
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(page).not.toHaveURL(/album=/);
  await expect(page).toHaveURL(/page=2/);
  await expect(search).toHaveValue(prefix);
  await expect(page.locator(".media-album-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: `Edit album ${title}`, exact: true }),
  ).toBeVisible();
}
