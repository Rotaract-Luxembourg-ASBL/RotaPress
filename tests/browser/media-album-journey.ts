import { expect, type Page } from "@playwright/test";
import type {
  AlbumCollection,
  AlbumDetail,
} from "../../src/features/media/album_schemas";
import {
  albumLocationJourney,
  albumPlacementJourney,
} from "./album-placement-journey";

/** B02: a real album draft is arranged, published and updated independently. */
export async function mediaAlbumJourney(page: Page) {
  const viewport = page.viewportSize();
  await page.getByRole("link", { name: "Photo albums", exact: true }).click();
  await page.getByRole("button", { name: "Create album", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Create photo album",
    exact: true,
  });
  await editor
    .getByLabel("Album title", { exact: true })
    .fill("Synthetic reusable album");
  await editor
    .getByRole("button", { name: "Add photographs", exact: true })
    .click();
  const gallery = page.getByRole("dialog", {
    name: "Create gallery",
    exact: true,
  });
  await gallery
    .getByRole("searchbox", { name: "Search media", exact: true })
    .fill("Synthetic club image");
  await gallery
    .getByRole("checkbox", { name: "Select Synthetic club image", exact: true })
    .check();
  await gallery.getByRole("tab", { name: "Edit gallery", exact: true }).click();
  await gallery
    .getByLabel("Caption for image 1", { exact: true })
    .fill("Our club in action");
  await gallery
    .getByRole("button", { name: "Insert gallery", exact: true })
    .click();
  await expect(gallery).toHaveCount(0);
  await editor
    .getByRole("combobox", { name: "Layout", exact: true })
    .selectOption("masonry");
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  const saved = page.getByRole("dialog", {
    name: "Edit photo album",
    exact: true,
  });
  await expect(
    saved.getByText("Album draft saved.", { exact: true }),
  ).toBeVisible();
  const collection = (await page.request
    .get("/api/admin/media/albums?search=Synthetic%20reusable%20album")
    .then((response) => response.json())) as AlbumCollection;
  expect(collection.albums).toHaveLength(1);
  const id = collection.albums[0].id;
  const read = async () =>
    (await page.request
      .get(`/api/admin/media/albums/${id}`)
      .then((response) => response.json())) as AlbumDetail;
  expect((await read()).published).toBeNull();
  await saved
    .getByRole("button", { name: "Publish album", exact: true })
    .click();
  await expect(
    saved.getByText(
      "Album published. Linked galleries now show this version.",
      { exact: true },
    ),
  ).toBeVisible();
  expect((await read()).published?.items[0].caption).toBe("Our club in action");
  await saved
    .getByLabel("Description", { exact: true })
    .fill("An updated album description");
  await saved.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    saved.getByText("Album draft saved.", { exact: true }),
  ).toBeVisible();
  expect((await read()).published?.description).toBe("");
  await saved.screenshot({ path: ".local/media-album-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await saved.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  const bounds = await saved.evaluate((element) => ({
    dialog: element.getBoundingClientRect().bottom,
    actions: element
      .querySelector(".media-album-actions")!
      .getBoundingClientRect().bottom,
  }));
  expect(bounds.actions).toBeLessThanOrEqual(bounds.dialog);
  await saved.screenshot({ path: ".local/media-album-phone.png" });
  await saved
    .getByRole("button", { name: "Publish album", exact: true })
    .click();
  await expect(
    saved.getByText(
      "Album published. Linked galleries now show this version.",
      { exact: true },
    ),
  ).toBeVisible();
  expect((await read()).published?.description).toBe(
    "An updated album description",
  );
  await saved
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  if (viewport) await page.setViewportSize(viewport);
  await albumPlacementJourney(page, await read());
  await albumLocationJourney(page);
}
