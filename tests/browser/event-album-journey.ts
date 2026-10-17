import { expect, type Page } from "@playwright/test";
import type { AlbumDetail } from "../../src/features/media/album_schemas";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";

/** B01: the event form adapter can refresh and copy an album without Puck. */
export async function eventAlbumJourney(
  owner: Page,
  editorUrl: string,
  assetId: string,
) {
  const previousUrl = owner.url();
  const url = new URL(editorUrl);
  const pageId = url.searchParams.get("page")!;
  const origin = url.origin;
  const create = await owner.request.post("/api/admin/media/albums", {
    headers: { origin },
    data: {
      title: "Synthetic event album adapter",
      items: [
        { assetId, alt: "Event album photograph", caption: "Event album copy" },
      ],
    },
  });
  expect(create.ok(), await create.text()).toBe(true);
  const album = (await create.json()) as AlbumDetail;
  const publication = await owner.request.post(
    `/api/admin/media/albums/${album.id}/publication`,
    { headers: { origin }, data: { expectedVersion: album.version } },
  );
  expect(publication.ok(), await publication.text()).toBe(true);
  const base = `/api/admin/cms/content/${pageId}`;
  const original = (await owner.request
    .get(`${base}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  await owner.goto(editorUrl);
  await owner.getByRole("button", { name: "Add section", exact: true }).click();
  await owner.getByRole("button", { name: "Add Gallery", exact: true }).click();
  const source = owner.getByRole("combobox", {
    name: "Gallery source",
    exact: true,
  });
  await source.selectOption(album.id);
  await expect(source).toHaveValue(album.id);
  await expect(
    owner.getByRole("button", { name: "Refresh album preview", exact: true }),
  ).toBeVisible();
  await expect(
    owner.getByRole("button", {
      name: "Convert to independent copy",
      exact: true,
    }),
  ).toBeVisible();
  const preview = owner.frameLocator('iframe[title="Unsaved website preview"]');
  await expect(
    preview.getByText("Event album copy", { exact: true }),
  ).toBeVisible();
  const refreshed = owner.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `${base}/preview` &&
      response.request().method() === "POST",
  );
  const [refreshResponse] = await Promise.all([
    refreshed,
    owner
      .getByRole("button", { name: "Refresh album preview", exact: true })
      .click(),
  ]);
  expect(refreshResponse.ok()).toBe(true);
  await owner
    .getByRole("button", { name: "Convert to independent copy", exact: true })
    .click();
  await expect(source).toHaveValue("");
  await owner.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    owner.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  const saved = (await owner.request
    .get(`${base}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  const copied = saved.draft.data.content.find(
    (block) =>
      block.type === "Gallery" &&
      block.props.items.some((item) => item.caption === "Event album copy"),
  );
  expect(copied).toMatchObject({
    type: "Gallery",
    props: { items: album.draft.items },
  });
  expect(copied?.props).not.toHaveProperty("albumId");
  // Keep the event's existing draft/publication unchanged for the later journey.
  const restored = await owner.request.post(`${base}/save`, {
    headers: { origin },
    data: {
      locale: "en",
      expectedRevisionId: saved.draft.id,
      title: original.draft.title,
      slug: original.draft.slug,
      description: original.draft.description,
      socialImageId: original.draft.socialImageId,
      data: original.draft.data,
    },
  });
  expect(restored.ok(), await restored.text()).toBe(true);
  await owner.goto(previousUrl);
}
