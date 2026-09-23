import { expect, type Page } from "@playwright/test";
import sharp from "sharp";
import type { SiteDraft } from "../../src/features/cms/cms_schemas";
import type { MediaAssetDto } from "../../src/features/media/media_schemas";
import { saveWebsiteSettings } from "./website-workspace-journey";

/** B02: publish a menu while a private favicon remains a separate draft. */
export async function websitePublicationJourney(
  page: Page,
  visitor: Page,
  origin: string,
) {
  const current = async () =>
    (await page.request
      .get("/api/admin/cms/site?locale=en")
      .then((response) => response.json())) as SiteDraft;
  const before = await current();
  const uploaded = await page.request.post("/api/admin/media", {
    headers: { origin },
    multipart: {
      title: "Synthetic private favicon",
      file: {
        name: "synthetic-favicon.png",
        mimeType: "image/png",
        buffer: await sharp({
          create: {
            width: 32,
            height: 32,
            channels: 3,
            background: "#245d68",
          },
        })
          .png()
          .toBuffer(),
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  const asset = (await uploaded.json()) as MediaAssetDto;
  expect(asset.visibility).toBe("private");
  const saved = await page.request.post("/api/admin/cms/site", {
    headers: { origin },
    data: {
      locale: "en",
      expectedVersion: before.version,
      settings: {
        ...before.draft,
        branding: { ...before.draft.branding, iconId: asset.id },
      },
    },
  });
  expect(saved.ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/website?tab=menus");
  await page
    .getByRole("textbox", { name: "Link label", exact: true })
    .first()
    .fill("Club home");
  await saveWebsiteSettings(page);
  const trigger = page.getByRole("button", {
    name: "Publish website",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Publish website",
    exact: true,
  });
  await expect(dialog.getByRole("radio", { name: /^Menu only/ })).toBeChecked();
  await dialog.getByRole("radio", { name: /^Entire website/ }).check();
  const images = dialog.getByRole("region", { name: "Images to review" });
  await expect(images.getByText(asset.title, { exact: true })).toBeVisible();
  await expect(
    images.getByRole("link", {
      name: "Browser icon (favicon) · Branding & appearance",
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: "Publish reviewed website",
      exact: true,
    }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("radio", { name: /^Menu only/ }).check();
  await expect(images).toHaveCount(0);
  await dialog
    .getByRole("checkbox", {
      name: "I reviewed this menu and want to make these saved choices public.",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Publish reviewed menu", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Menu published. Your other saved changes remain drafts.", {
      exact: true,
    }),
  ).toBeVisible();
  const afterMenu = await current();
  expect(afterMenu.published?.navigation[0].label).toBe("Club home");
  expect(afterMenu.published?.branding).toEqual(before.published?.branding);
  expect(afterMenu.draft.branding.iconId).toBe(asset.id);
  expect((await visitor.request.get(`/media/${asset.id}`)).status()).toBe(404);
  await visitor.setViewportSize({ width: 1440, height: 1000 });
  await visitor.goto("/");
  await expect(
    visitor
      .locator("header")
      .getByRole("link", { name: "Club home", exact: true }),
  ).toBeVisible();

  // The exact image opens in the existing Media editor. Visibility is deliberate.
  await trigger.click();
  await dialog.getByRole("radio", { name: /^Entire website/ }).check();
  const popupPromise = page.waitForEvent("popup");
  await images
    .getByRole("link", { name: `Review ${asset.title} in Media`, exact: true })
    .click();
  const media = await popupPromise;
  const details = media.getByRole("dialog", {
    name: "Image details",
    exact: true,
  });
  await expect(details.getByLabel("Title", { exact: true })).toHaveValue(
    asset.title,
  );
  await expect(
    details.getByRole("combobox", { name: /^Visibility/ }),
  ).toHaveValue("private");
  await details
    .getByRole("combobox", { name: /^Visibility/ })
    .selectOption("public");
  await details
    .getByRole("button", { name: "Save image details", exact: true })
    .click();
  await expect(
    details.getByText("Image details saved.", { exact: true }),
  ).toBeVisible();
  await media.close();
  await page.bringToFront();
  // Returning to the window automatically refreshes the review.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(images).toHaveCount(0);
  await dialog
    .getByRole("checkbox", {
      name: "I reviewed this website and want to make these saved changes public.",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Publish reviewed website", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect((await current()).published?.branding.iconId).toBe(asset.id);
  await visitor.reload();
  await expect(
    visitor.locator(`link[rel="icon"][href="/media/${asset.id}"]`),
  ).toHaveCount(1);
  expect((await visitor.request.get(`/media/${asset.id}`)).status()).toBe(200);
}
