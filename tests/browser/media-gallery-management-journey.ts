import { expect, type Locator, type Page } from "@playwright/test";
import type { AdminMediaAssetDto } from "../../src/features/media/media_schemas";

/** B02: gallery management changes visibility without rewriting draft placements. */
export async function mediaGalleryManagementJourney(
  page: Page,
  visitor: Page,
  gallery: Locator,
) {
  const search = gallery.getByRole("searchbox", {
    name: "Search media",
    exact: true,
  });
  await gallery
    .getByRole("tab", { name: "Media library", exact: true })
    .click();
  await search.fill("private-gallery-fixture");
  await gallery
    .getByRole("button", { name: "Bulk select", exact: true })
    .click();
  const list = (await page.request
    .get("/api/admin/media?search=private-gallery-fixture")
    .then((response) => response.json())) as { assets: AdminMediaAssetDto[] };
  expect(list.assets).toHaveLength(2);
  for (const visibility of ["public", "private"] as const) {
    await gallery
      .getByRole("button", { name: "Select all shown", exact: true })
      .click();
    for (const asset of list.assets)
      await expect(
        gallery.getByRole("checkbox", {
          name: `Select ${asset.title}`,
          exact: true,
        }),
      ).toBeChecked();
    await gallery
      .getByRole("button", { name: `Make ${visibility}`, exact: true })
      .click();
    await expect
      .poll(async () => {
        const result = (await page.request
          .get("/api/admin/media?search=private-gallery-fixture")
          .then((response) => response.json())) as {
          assets: AdminMediaAssetDto[];
        };
        return (
          result.assets.length === 2 &&
          result.assets.every((asset) => asset.visibility === visibility)
        );
      })
      .toBe(true);
    for (const asset of list.assets)
      expect((await visitor.request.get(`/media/${asset.id}`)).status()).toBe(
        visibility === "public" ? 200 : 404,
      );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await gallery.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBe(true);
  await gallery.screenshot({ path: ".local/media-gallery-bulk-phone.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Switching to arrangement exits management and restores gallery insertion.
  await gallery.getByRole("tab", { name: "Edit gallery", exact: true }).click();
  await expect(
    gallery.getByRole("button", { name: /^(Insert|Update) gallery$/ }),
  ).toBeEnabled();
  await expect(
    gallery.getByLabel("Caption for image 1", { exact: true }),
  ).toHaveValue("Private photo caption");
  await expect(
    gallery.getByLabel("Caption for image 2", { exact: true }),
  ).toHaveValue("Public club photo");
  await expect(
    gallery.getByLabel("Alternative text for image 1", { exact: true }),
  ).toHaveValue("Private gallery test photograph");
}
