import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import sharp from "sharp";
import type { AdminMediaAssetDto } from "../../src/features/media/media_schemas";

/** B02: manage a selected batch without losing the image being inserted. */
export async function mediaPickerManagementJourney(page: Page, visitor: Page) {
  const viewport = page.viewportSize();
  const picker = page.getByRole("dialog", {
    name: "Choose an image",
    exact: true,
  });
  const search = picker.getByRole("searchbox", {
    name: "Search media",
    exact: true,
  });
  const origin = new URL(page.url()).origin;
  const bytes = await sharp({
    create: { width: 96, height: 64, channels: 3, background: "#426d61" },
  })
    .png()
    .toBuffer();
  const assets: AdminMediaAssetDto[] = [];
  for (const color of ["red", "green"]) {
    const response = await page.request.post("/api/admin/media", {
      headers: { origin },
      multipart: {
        requestId: randomUUID(),
        title: `Popup management ${color}`,
        file: {
          name: `popup-management-${color}.png`,
          mimeType: "image/png",
          buffer: bytes,
        },
      },
    });
    expect(response.status()).toBe(201);
    const asset = (await response.json()) as AdminMediaAssetDto;
    expect(asset.visibility).toBe("public");
    expect((await visitor.request.get(`/media/${asset.id}`)).status()).toBe(
      200,
    );
    assets.push(asset);
  }
  async function readAssets() {
    const response = await page.request.get(
      "/api/admin/media?search=Popup%20management",
    );
    expect(response.status()).toBe(200);
    return ((await response.json()) as { assets: AdminMediaAssetDto[] }).assets;
  }
  async function selectShown() {
    await search.fill("Popup management");
    await expect(
      picker.getByRole("checkbox", { name: /^Select Popup management/ }),
    ).toHaveCount(2);
    await picker
      .getByRole("button", { name: "Select all shown", exact: true })
      .click();
  }
  async function expectVisibility(visibility: "private" | "public") {
    await expect
      .poll(async () => {
        const current = await readAssets();
        return (
          current.length === 2 &&
          current.every((asset) => asset.visibility === visibility)
        );
      })
      .toBe(true);
    for (const asset of assets)
      expect((await visitor.request.get(`/media/${asset.id}`)).status()).toBe(
        visibility === "public" ? 200 : 404,
      );
  }

  await picker
    .getByRole("button", { name: "Bulk select", exact: true })
    .click();
  await expect(
    picker.getByRole("button", { name: "Insert image", exact: true }),
  ).toBeDisabled();
  for (const color of ["red", "green"]) {
    await search.fill(`Popup management ${color}`);
    await picker
      .getByRole("checkbox", {
        name: `Select Popup management ${color}`,
        exact: true,
      })
      .check();
  }
  await search.fill("Popup management");
  await expect(
    picker.getByText("2 selected across pages", { exact: true }),
  ).toBeVisible();
  await picker
    .getByRole("button", { name: "Make private", exact: true })
    .click();
  await expectVisibility("private");
  await selectShown();
  await picker
    .getByRole("button", { name: "Make public", exact: true })
    .click();
  await expectVisibility("public");
  await expect(
    picker.getByRole("button", { name: "Done selecting", exact: true }),
  ).toBeFocused();
  // Moving to another task exits management without losing the insertion choice.
  await picker.getByRole("tab", { name: "Upload image", exact: true }).click();
  await picker.getByRole("tab", { name: "Media library", exact: true }).click();
  await expect(
    picker.getByRole("button", { name: "Insert image", exact: true }),
  ).toBeEnabled();
  await expect(
    picker
      .getByRole("complementary", { name: "Selected image", exact: true })
      .getByRole("heading", { name: "Synthetic club image", exact: true }),
  ).toBeVisible();
  await picker
    .getByRole("button", { name: "Bulk select", exact: true })
    .click();

  await selectShown();
  await picker
    .getByRole("button", { name: "Edit selected", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Edit selected files",
    exact: true,
  });
  await editor
    .getByRole("checkbox", { name: "Change collection", exact: true })
    .check();
  await editor
    .getByLabel("Collection", { exact: true })
    .fill("Popup verification");
  await editor
    .getByRole("checkbox", { name: "Change tags", exact: true })
    .check();
  await editor
    .getByLabel("Tags, separated by commas", { exact: true })
    .fill("popup, synthetic");

  // A real competing save must reject the whole batch while preserving its form.
  const current = (await readAssets()).find(
    (asset) => asset.id === assets[0].id,
  )!;
  const competing = await page.request.patch(`/api/admin/media/${current.id}`, {
    headers: { origin },
    data: {
      title: current.title,
      alt: current.alt,
      caption: "A concurrent saved caption",
      tags: current.tags,
      collection: current.collection,
      visibility: current.visibility,
      expectedRevision: current.metadataRevision,
    },
  });
  expect(competing.status()).toBe(200);
  await editor
    .getByRole("button", { name: "Update selected files", exact: true })
    .click();
  await expect(
    editor.getByRole("alert").filter({ hasText: "selected images changed" }),
  ).toBeVisible();
  await expect(editor.getByLabel("Collection", { exact: true })).toHaveValue(
    "Popup verification",
  );
  await expect(
    editor.getByLabel("Tags, separated by commas", { exact: true }),
  ).toHaveValue("popup, synthetic");
  expect(
    (await readAssets()).every(
      (asset) => asset.collection === "" && asset.tags.length === 0,
    ),
  ).toBe(true);
  await editor
    .getByRole("button", { name: "Refresh selected files", exact: true })
    .click();
  await expect(editor.getByLabel("Collection", { exact: true })).toHaveValue(
    "Popup verification",
  );
  await expect(
    editor.getByLabel("Tags, separated by commas", { exact: true }),
  ).toHaveValue("popup, synthetic");
  await expect(
    editor.getByRole("button", { name: "Update selected files", exact: true }),
  ).toBeEnabled();
  await editor
    .getByRole("button", { name: "Update selected files", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect
    .poll(async () => {
      const saved = await readAssets();
      return (
        saved.length === 2 &&
        saved.every(
          (asset) =>
            asset.collection === "Popup verification" &&
            asset.tags.join(",") === "popup,synthetic",
        )
      );
    })
    .toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await selectShown();
  await expect(
    picker.getByRole("button", { name: "Make private", exact: true }),
  ).toBeVisible();
  expect(
    await picker.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await picker.screenshot({ path: ".local/media-picker-bulk-phone.png" });
  const [confirmation] = await Promise.all([
    page.waitForEvent("dialog"),
    picker
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click(),
  ]);
  expect(confirmation.message()).toContain("2 selected files permanently");
  await expect.poll(async () => (await readAssets()).length).toBe(0);
  for (const asset of assets)
    expect((await visitor.request.get(`/media/${asset.id}`)).status()).toBe(
      404,
    );
  await picker
    .getByRole("button", { name: "Done selecting", exact: true })
    .click();
  await search.fill("");
  await expect(
    picker
      .getByRole("complementary", { name: "Selected image", exact: true })
      .getByRole("heading", { name: "Synthetic club image", exact: true }),
  ).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "Insert image", exact: true }),
  ).toBeEnabled();
  if (viewport) await page.setViewportSize(viewport);
}
