import { expect, type Page } from "@playwright/test";
import type { AdminMediaAssetDto } from "../../src/features/media/media_schemas";

/** B02: editing a private photo saves a protected copy and preserves its source. */
export async function mediaImageEditingJourney(
  page: Page,
  publicPage: Page,
  original: AdminMediaAssetDto,
) {
  const viewport = page.viewportSize();
  const search = page.getByRole("searchbox", {
    name: "Search media",
    exact: true,
  });
  await search.fill("private-gallery-fixture");
  await page
    .getByRole("button", { name: "Open private-gallery-fixture", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Image details",
    exact: true,
  });
  const preview = dialog.getByRole("region", {
    name: "Image preview",
    exact: true,
  });
  const inspector = dialog.getByRole("complementary", {
    name: "Image information",
    exact: true,
  });
  const geometry = await dialog.evaluate((element) => {
    const preview = element
      .querySelector(".media-preview-canvas")!
      .getBoundingClientRect();
    const image = element
      .querySelector(".media-preview-canvas img")!
      .getBoundingClientRect();
    const footer = element
      .querySelector(".media-detail-actions")!
      .getBoundingClientRect();
    const modal = element.getBoundingClientRect();
    return {
      previewTop: preview.top,
      imageTop: image.top,
      imageBottom: image.bottom,
      previewBottom: preview.bottom,
      footerBottom: footer.bottom,
      modalBottom: modal.bottom,
    };
  });
  expect(geometry.imageTop).toBeGreaterThanOrEqual(geometry.previewTop - 1);
  expect(geometry.imageBottom).toBeLessThanOrEqual(geometry.previewBottom + 1);
  expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.modalBottom);
  await expect(preview).toBeVisible();
  await inspector.getByRole("tab", { name: "Organize", exact: true }).click();
  await expect(
    inspector.getByLabel("Collection", { exact: true }),
  ).toBeVisible();
  await inspector.getByRole("tab", { name: "Usage", exact: true }).click();
  await expect(inspector.getByLabel("File URL", { exact: true })).toBeVisible();
  await inspector.getByRole("tab", { name: "Details", exact: true }).click();
  await dialog.screenshot({ path: ".local/media-workbench-desktop.png" });
  await dialog.getByRole("button", { name: "Edit image", exact: true }).click();
  const editor = dialog.getByRole("region", {
    name: "Image editor",
    exact: true,
  });
  await expect(
    editor.getByRole("button", { name: "Back to details", exact: true }),
  ).toBeFocused();
  // A tall SVG viewport letterboxes this landscape image. Crop coordinates
  // must follow the visible pixels rather than the viewport's empty margins.
  const cropCanvas = editor.getByRole("group", {
    name: "Original image crop area",
    exact: true,
  });
  const cropPoints = await cropCanvas.evaluate((element) => {
    const svg = element as SVGSVGElement;
    svg.style.height = "300px";
    svg.style.width = "120px";
    const matrix = svg.getScreenCTM()!;
    const start = new DOMPoint(119, 79).matrixTransform(matrix);
    const end = new DOMPoint(59, 39).matrixTransform(matrix);
    return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
  });
  await page.mouse.move(cropPoints.start.x, cropPoints.start.y);
  await page.mouse.down();
  await page.mouse.move(cropPoints.end.x, cropPoints.end.y, { steps: 4 });
  await page.mouse.up();
  const selection = editor.getByRole("button", {
    name: "Move crop selection with arrow keys",
    exact: true,
  });
  await selection.focus();
  await selection.press("Shift+ArrowRight");
  await selection.press("Shift+ArrowDown");
  await expect(editor.getByLabel("Crop left", { exact: true })).toHaveValue(
    "10",
  );
  await expect(editor.getByLabel("Crop top", { exact: true })).toHaveValue(
    "10",
  );
  await expect(editor.getByLabel("Crop width", { exact: true })).toHaveValue(
    "60",
  );
  await expect(editor.getByLabel("Crop height", { exact: true })).toHaveValue(
    "40",
  );
  await cropCanvas.evaluate((element) => {
    (element as SVGSVGElement).style.removeProperty("width");
    (element as SVGSVGElement).style.removeProperty("height");
  });
  await editor.getByLabel("Crop ratio", { exact: true }).selectOption("1");
  await expect(editor.getByLabel("Crop width", { exact: true })).toHaveValue(
    "60",
  );
  await expect(editor.getByLabel("Crop height", { exact: true })).toHaveValue(
    "60",
  );
  await editor.getByLabel("Preview zoom", { exact: true }).selectOption("150");
  await expect(cropCanvas).toHaveAttribute("style", /width: 150%/);
  await editor
    .getByRole("button", { name: "Reset edits", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Rotate right", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Flip horizontally", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Undo image edit", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Flip horizontally", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await editor
    .getByRole("button", { name: "Redo image edit", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Flip horizontally", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await editor.getByLabel("Crop left", { exact: true }).fill("5");
  await editor.getByLabel("Crop top", { exact: true }).fill("5");
  await editor.getByLabel("Crop width", { exact: true }).fill("40");
  await editor.getByLabel("Crop height", { exact: true }).fill("30");
  await editor.getByLabel("Resize width (pixels)", { exact: true }).fill("15");
  await expect(editor.getByRole("status")).toContainText("15 × 20 pixels");
  const expectActionsVisible = async () => {
    const bounds = await editor.evaluate((element) => ({
      editor: element.getBoundingClientRect().bottom,
      actions: element
        .querySelector(".media-image-editor-actions")!
        .getBoundingClientRect().bottom,
    }));
    expect(bounds.actions).toBeLessThanOrEqual(bounds.editor + 1);
    await expect(
      editor.getByRole("button", { name: "Save edited copy", exact: true }),
    ).toBeInViewport();
  };
  await expectActionsVisible();
  await dialog.screenshot({ path: ".local/media-image-editor-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await expectActionsVisible();
  await dialog.screenshot({ path: ".local/media-image-editor-phone.png" });
  await editor
    .getByRole("button", { name: "Save edited copy", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
    "private-gallery-fixture (edited)",
  );
  const result = (await page.request
    .get("/api/admin/media?search=private-gallery-fixture")
    .then((response) => response.json())) as { assets: AdminMediaAssetDto[] };
  const copy = result.assets.find((asset) => asset.id !== original.id)!;
  expect(copy).toMatchObject({ visibility: "private", width: 15, height: 20 });
  expect(result.assets.find((asset) => asset.id === original.id)).toMatchObject(
    { width: 120, height: 80, visibility: "private" },
  );
  expect((await publicPage.request.get(`/media/${copy.id}`)).status()).toBe(
    404,
  );
  expect(
    (
      await publicPage.request.get(`/media/${copy.id}?variant=thumbnail`)
    ).status(),
  ).toBe(404);
  const thumbnail = await page.request.get(
    `/media/${copy.id}?variant=thumbnail`,
  );
  expect(thumbnail.status()).toBe(200);
  expect(thumbnail.headers()["cache-control"]).toContain("no-store");
  const unauthorized = await publicPage.request.post(
    `/api/admin/media/${original.id}/edit`,
    {
      headers: { origin: new URL(page.url()).origin },
      data: {
        requestId: crypto.randomUUID(),
        expectedRevision: original.metadataRevision,
        rotate: 90,
      },
    },
  );
  expect(unauthorized.status()).toBe(401);
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  if (viewport) await page.setViewportSize(viewport);
  await search.fill("");
}
