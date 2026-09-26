import { expect, type Page } from "@playwright/test";
import sharp from "sharp";

/** B02 opens its existing image picker before continuing normal insertion. */
export async function mediaPickerJourney(page: Page) {
  const viewport = page.viewportSize();
  const picker = page.getByRole("dialog", {
    name: "Choose an image",
    exact: true,
  });
  await picker
    .getByRole("button", { name: "Select Synthetic club image", exact: true })
    .click();
  const edit = picker.getByRole("button", {
    name: "Edit image details",
    exact: true,
  });
  await edit.click();
  const back = picker.getByRole("button", {
    name: "Back to images",
    exact: true,
  });
  await expect(back).toBeFocused();
  await back.click();
  await expect(edit).toBeFocused();

  const upload = picker.getByRole("tab", { name: "Upload image", exact: true });
  const library = picker.getByRole("tab", {
    name: "Media library",
    exact: true,
  });
  await upload.click();
  const png = await sharp({
    create: { width: 120, height: 80, channels: 3, background: "#47675a" },
  })
    .png()
    .toBuffer();
  const file = picker.getByLabel("Image file", { exact: true });
  await file.setInputFiles({
    name: "picker-draft.png",
    mimeType: "image/png",
    buffer: png,
  });
  const title = picker.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("Keep my selected upload");
  await picker
    .getByRole("textbox", { name: "Alternative text", exact: true })
    .fill("Synthetic green image");
  await expect(
    picker.getByRole("img", { name: "Selected upload preview" }),
  ).toBeVisible();
  await upload.press("ArrowLeft");
  await expect(library).toBeFocused();
  await expect(library).toHaveAttribute("aria-selected", "true");
  await library.press("ArrowRight");
  await expect(upload).toBeFocused();
  await expect(title).toHaveValue("Keep my selected upload");
  await expect(file).toHaveValue(/picker-draft\.png$/);
  await picker.screenshot({ path: ".local/media-picker-upload-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(picker).toBeVisible();
  expect(
    await picker.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await picker.screenshot({ path: ".local/media-picker-upload-phone.png" });
  if (viewport) await page.setViewportSize(viewport);

  // The principal journey already accepts confirmation dialogs.
  const [confirmation] = await Promise.all([
    page.waitForEvent("dialog"),
    picker.getByRole("button", { name: "Cancel", exact: true }).click(),
  ]);
  expect(confirmation.type()).toBe("confirm");
  expect(confirmation.message()).toContain(
    "Discard your unsaved image changes",
  );
  await expect(picker).toHaveCount(0);
  const trigger = page
    .getByRole("button", { name: "Choose image", exact: true })
    .first();
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await expect(picker).toBeVisible();
  await expect(library).toHaveAttribute("aria-selected", "true");
  await expect(
    picker.getByRole("button", { name: "Insert image", exact: true }),
  ).toBeDisabled();
}
