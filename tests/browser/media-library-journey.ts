import { expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { mediaImageEditingJourney } from "./media-image-editing-journey";
import type { AdminMediaAssetDto } from "../../src/features/media/media_schemas";

/** B02: real saved batches, public defaults, protected references and recovery. */
export async function mediaLibraryJourney(
  page: Page,
  publicPage: Page,
  referencedId: string,
) {
  const viewport = page.viewportSize();
  const fixtures = await Promise.all(
    ["red", "green", "blue"].map(async (color) => ({
      name: `bulk-${color}.png`,
      mimeType: "image/png",
      buffer: await sharp({
        create: { width: 120, height: 80, channels: 3, background: color },
      })
        .png()
        .toBuffer(),
    })),
  );
  const uploadDialog = page.getByRole("dialog", {
    name: "Upload images",
    exact: true,
  });
  const search = page.getByRole("searchbox", {
    name: "Search media",
    exact: true,
  });
  async function readAssets() {
    const response = await page.request.get("/api/admin/media?search=bulk-");
    expect(response.status()).toBe(200);
    return ((await response.json()) as { assets: AdminMediaAssetDto[] }).assets;
  }
  async function selectShown() {
    const clear = page.getByRole("button", {
      name: "Clear selection",
      exact: true,
    });
    if (await clear.isVisible()) await clear.click();
    await search.fill("bulk-");
    await expect(
      page.getByRole("checkbox", { name: /^Select bulk-/ }),
    ).toHaveCount(3);
    await page
      .getByRole("button", { name: "Select all shown", exact: true })
      .click();
  }
  async function expectVisibility(visibility: "private" | "public") {
    await expect
      .poll(async () => {
        const assets = await readAssets();
        return (
          assets.length === 3 &&
          assets.every((asset) => asset.visibility === visibility)
        );
      })
      .toBe(true);
  }

  await page.goto("/admin/media");
  const policy = (await page.request.get("/admin/media")).headers()[
    "content-security-policy"
  ];
  expect(
    policy.split(";").find((part) => part.trim().startsWith("img-src")),
  ).toContain("blob:");
  expect(
    policy.split(";").find((part) => part.trim().startsWith("script-src")),
  ).not.toContain("blob:");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  await uploadDialog
    .getByLabel("Image file", { exact: true })
    .setInputFiles(fixtures);
  await expect(
    uploadDialog.getByLabel("Visibility", { exact: true }),
  ).toHaveValue("public");
  await expect(
    uploadDialog.getByText("bulk-red.png", { exact: true }),
  ).toBeVisible();
  await expect(
    uploadDialog.getByText("bulk-blue.png", { exact: true }),
  ).toBeVisible();
  await uploadDialog
    .getByRole("button", { name: "Upload 3 images", exact: true })
    .waitFor({ state: "visible" });
  await expect
    .poll(() =>
      uploadDialog
        .getByRole("img", { name: "Selected upload preview" })
        .first()
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(120);
  await uploadDialog
    .getByRole("button", { name: "Upload 3 images", exact: true })
    .click();
  await uploadDialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(uploadDialog).toHaveCount(0);
  await expectVisibility("public");
  const uploaded = await readAssets();
  for (const asset of uploaded)
    expect((await publicPage.request.get(`/media/${asset.id}`)).status()).toBe(
      200,
    );

  // The private choice is deliberate even though every new queue starts public.
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  await uploadDialog.getByLabel("Image file", { exact: true }).setInputFiles({
    ...fixtures[0],
    name: "private-gallery-fixture.png",
  });
  await uploadDialog
    .getByLabel("Visibility", { exact: true })
    .selectOption("private");
  await uploadDialog
    .getByRole("button", { name: "Upload 1 image", exact: true })
    .click();
  await uploadDialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(uploadDialog).toHaveCount(0);
  const privateResponse = await page.request.get(
    "/api/admin/media?search=private-gallery-fixture",
  );
  const privateAssets = (await privateResponse.json()) as {
    assets: AdminMediaAssetDto[];
  };
  expect(privateAssets.assets).toHaveLength(1);
  expect(privateAssets.assets[0].visibility).toBe("private");
  expect(
    (
      await publicPage.request.get(`/media/${privateAssets.assets[0].id}`)
    ).status(),
  ).toBe(404);

  await mediaImageEditingJourney(page, publicPage, privateAssets.assets[0]);
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".media-list")).toBeVisible();
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await expect(page.locator(".media-list")).toHaveCount(0);

  // Selection includes exactly the chosen files while filters change around it.
  for (const color of ["red", "green", "blue"]) {
    await search.fill(`bulk-${color}`);
    await page
      .getByRole("checkbox", { name: `Select bulk-${color}`, exact: true })
      .check();
  }
  await search.fill("bulk-");
  for (const color of ["red", "green", "blue"])
    await expect(
      page.getByRole("checkbox", { name: `Select bulk-${color}`, exact: true }),
    ).toBeChecked();
  await page.screenshot({
    path: ".local/media-library-bulk-desktop.png",
    fullPage: true,
    mask: [page.locator(".admin-account")],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/media-library-bulk-phone.png",
    fullPage: true,
    mask: [page.locator(".admin-account")],
  });
  if (viewport) await page.setViewportSize(viewport);
  await page.getByRole("button", { name: "Make private", exact: true }).click();
  await expectVisibility("private");
  for (const asset of uploaded)
    expect((await publicPage.request.get(`/media/${asset.id}`)).status()).toBe(
      404,
    );
  await selectShown();
  await page.getByRole("button", { name: "Make public", exact: true }).click();
  await expectVisibility("public");
  await page.reload();
  await expectVisibility("public");

  // Exercise a recoverable conflict response without replacing real persistence.
  await selectShown();
  await page.route(
    "**/api/admin/media",
    async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: "These selected images changed. Refresh and try again.",
        }),
      });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Make private", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "These selected images changed" }),
  ).toBeVisible();
  for (const color of ["red", "green", "blue"])
    await expect(
      page.getByRole("checkbox", { name: `Select bulk-${color}`, exact: true }),
    ).toBeChecked();
  await expectVisibility("public");

  await page
    .getByRole("button", { name: "Edit selected", exact: true })
    .click();
  const editBatch = page.getByRole("dialog", {
    name: "Edit selected images",
    exact: true,
  });
  await editBatch
    .getByRole("checkbox", { name: "Change collection", exact: true })
    .check();
  await editBatch
    .getByLabel("Collection", { exact: true })
    .fill("Gallery verification");
  await editBatch
    .getByRole("checkbox", { name: "Change tags", exact: true })
    .check();
  await editBatch
    .getByLabel("Tags, separated by commas", { exact: true })
    .fill("gallery, synthetic");
  await editBatch
    .getByRole("button", { name: "Update selected images", exact: true })
    .click();
  await expect(editBatch).toHaveCount(0);
  await expect
    .poll(async () =>
      (await readAssets()).every(
        (asset) =>
          asset.collection === "Gallery verification" &&
          asset.tags.join(",") === "gallery,synthetic",
      ),
    )
    .toBe(true);

  const clear = page.getByRole("button", {
    name: "Clear selection",
    exact: true,
  });
  if (await clear.isVisible()) await clear.click();
  await search.fill("Gallery verification");
  await expect(page.getByRole("button", { name: /^Open bulk-/ })).toHaveCount(
    3,
  );
  await search.fill("bulk-");
  const opener = page.getByRole("button", {
    name: "Open bulk-blue",
    exact: true,
  });
  await opener.click();
  const details = page.getByRole("dialog", {
    name: "Image details",
    exact: true,
  });
  await details
    .getByLabel("Title", { exact: true })
    .fill("Unfinished gallery title");
  const [navigationConfirmation] = await Promise.all([
    page.waitForEvent("dialog"),
    details.getByRole("button", { name: "Next image", exact: true }).click(),
  ]);
  expect(navigationConfirmation.type()).toBe("confirm");
  expect(navigationConfirmation.message()).toContain(
    "Discard your unsaved image changes",
  );
  const blue = uploaded.find((asset) => asset.title === "bulk-blue")!;
  expect(
    (
      (await page.request
        .get(`/api/admin/media/${blue.id}`)
        .then((response) => response.json())) as { asset: AdminMediaAssetDto }
    ).asset.title,
  ).toBe("bulk-blue");
  await details
    .getByRole("button", { name: "Previous image", exact: true })
    .click();
  await expect(details.getByLabel("Title", { exact: true })).toHaveValue(
    "bulk-blue",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(details).toBeVisible();
  expect(
    await details.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await details.screenshot({
    path: ".local/media-attachment-details-phone.png",
  });
  await details
    .getByLabel("Caption", { exact: true })
    .fill("Unsaved phone caption");
  const [dismissConfirmation] = await Promise.all([
    page.waitForEvent("dialog"),
    page.keyboard.press("Escape"),
  ]);
  expect(dismissConfirmation.message()).toContain(
    "Discard your unsaved image changes",
  );
  await expect(details).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (viewport) await page.setViewportSize(viewport);

  // A live/retained image is protected for the whole chosen batch.
  await search.fill("Synthetic club image");
  await page
    .getByRole("checkbox", { name: "Select Synthetic club image", exact: true })
    .check();
  await page.getByRole("button", { name: "Make private", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /published content/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", {
      name: "Select Synthetic club image",
      exact: true,
    }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /retained by content|revision history/ }),
  ).toBeVisible();
  expect(
    (await publicPage.request.get(`/media/${referencedId}`)).status(),
  ).toBe(200);

  await selectShown();
  const [deletionConfirmation] = await Promise.all([
    page.waitForEvent("dialog"),
    page
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click(),
  ]);
  expect(deletionConfirmation.type()).toBe("confirm");
  await expect.poll(async () => (await readAssets()).length).toBe(0);
  for (const asset of uploaded)
    expect((await publicPage.request.get(`/media/${asset.id}`)).status()).toBe(
      404,
    );
  await expect(
    page.getByRole("heading", { name: "No images to show", exact: true }),
  ).toBeVisible();
}
