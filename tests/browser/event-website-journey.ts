import { expect, type Page, type Browser } from "@playwright/test";
import sharp from "sharp";
import { smokeOrigin as origin } from "../../scripts/smoke_origin.mjs";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import { eventPreviewJourney } from "./event-preview-journey";

/** Continues B01 with its real, currently assigned manager session. */
export async function eventWebsiteJourney(
  owner: Page,
  manager: Page,
  browser: Browser,
  eventId: string,
) {
  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  const url = `${origin}/events/${eventId}/en/website`;
  const panel = manager.getByRole("region", {
    name: "Event website and features",
    exact: true,
  });
  await manager.setViewportSize({ width: 1440, height: 1000 });
  await manager.goto(`/admin/events/${eventId}`);
  await manager
    .getByRole("combobox", { name: "Visibility when published" })
    .selectOption("public");
  await manager
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("A synthetic community gathering for the local acceptance journey.");
  await manager
    .getByRole("button", { name: "Save event draft", exact: true })
    .click();
  await expect(
    manager.getByText("Event draft saved. It remains private."),
  ).toBeVisible();
  // Canceling the explicit activation prompt leaves the feature off.
  await manager.goto(`/admin/events/${eventId}?tab=website`);
  manager.once("dialog", (dialog) => dialog.dismiss());
  await panel
    .getByRole("button", { name: "Enable Website", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Enable Website", exact: true }),
  ).toBeVisible();
  manager.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Enable Website", exact: true })
    .click();
  const website = panel.getByRole("article", {
    name: "Website feature",
    exact: true,
  });
  await website
    .getByRole("combobox", { name: "Starting layout" })
    .selectOption("blank");
  await website
    .getByRole("button", { name: "Create EN page", exact: true })
    .click();
  await expect(manager).toHaveURL(/\/admin\/events\/[^/?]+\?tab=website&page=/);
  await expect(
    manager.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeVisible();
  const id = new URL(manager.url()).searchParams.get("page")!;
  expect((await manager.request.get("/api/admin/media")).status()).toBe(403);
  expect((await visitor.request.get(url)).status()).toBe(404);
  await manager
    .getByRole("button", { name: "Add section", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Add Heading", exact: true })
    .click();
  await manager
    .getByRole("textbox", { name: "Heading text", exact: true })
    .fill("Together in our community");
  await manager
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(
    manager.getByText("Draft saved. Your public page has not changed."),
  ).toBeVisible();
  const popup = manager.waitForEvent("popup");
  await manager
    .getByRole("button", { name: "Page settings", exact: true })
    .click();
  await manager.getByRole("link", { name: /Preview saved draft/ }).click();
  const preview = await popup;
  await expect(preview.getByText(/Private event preview/)).toBeVisible();
  await expect(
    preview.getByRole("heading", {
      name: "Together in our community",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await manager.request.get(`/admin/website/${id}/preview?locale=en`)
    ).headers()["cache-control"],
  ).toMatch(/no-store/);
  await preview.setViewportSize({ width: 1440, height: 1000 });
  await preview.screenshot({
    path: ".local/event-preview-desktop.png",
    fullPage: true,
  });
  await preview.setViewportSize({ width: 390, height: 844 });
  expect(
    await preview.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await preview.screenshot({
    path: ".local/event-preview-phone.png",
    fullPage: true,
  });
  await preview.close();
  await eventPreviewJourney(manager, visitor, id);
  await visitor.goto(`${origin}/admin/website/${id}/preview?locale=en`);
  await expect(visitor).toHaveURL(/\/sign-in/);
  await Promise.all([
    manager.waitForEvent("dialog").then((dialog) => dialog.dismiss()),
    manager
      .getByRole("button", { name: "Publish changes", exact: true })
      .click(),
  ]);
  expect((await visitor.request.get(url)).status()).toBe(404);
  await Promise.all([
    manager.waitForEvent("dialog").then((dialog) => dialog.accept()),
    manager
      .getByRole("button", { name: "Publish changes", exact: true })
      .click(),
  ]);
  await expect(
    manager.getByText("Published. Guests now see this event and page."),
  ).toBeVisible();
  await manager
    .locator("summary")
    .filter({ hasText: /^Page languages & availability$/ })
    .click();
  await expect(panel.getByText(/Event details published/)).toBeVisible();
  await visitor.goto(url);
  await expect(
    visitor.getByRole("heading", {
      name: "Together in our community",
      exact: true,
    }),
  ).toBeVisible();
  const navigation = visitor.getByRole("navigation", {
    name: "Event navigation",
    exact: true,
  });
  await expect(
    navigation.getByRole("link", { name: "Gallery", exact: true }),
  ).toHaveCount(0);
  await visitor.goto(`${origin}/events`);
  await expect(
    visitor.getByRole("link", { name: "Synthetic Event A", exact: true }),
  ).toBeVisible();

  const image = await sharp({
    create: { width: 900, height: 500, channels: 3, background: "#477a69" },
  })
    .png()
    .toBuffer();
  const upload = await owner.request.post("/api/admin/media", {
    headers: { origin },
    multipart: {
      title: "Synthetic event image",
      alt: "Synthetic green sample",
      file: { name: "event-sample.png", mimeType: "image/png", buffer: image },
    },
  });
  expect(upload.status()).toBe(201);
  const asset = (await upload.json()) as { id: string };
  expect(
    (
      await manager.request
        .get(`/api/admin/events/${eventId}/media`)
        .then((r) => r.json())
    ).assets,
  ).toHaveLength(0);
  expect(
    (
      await owner.request.patch(`/api/admin/media/${asset.id}`, {
        headers: { origin },
        data: {
          title: "Synthetic event image",
          alt: "Synthetic green sample",
          visibility: "public",
        },
      })
    ).ok(),
  ).toBe(true);
  manager.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Enable Gallery", exact: true })
    .click();
  const gallery = panel.getByRole("article", {
    name: "Gallery feature",
    exact: true,
  });
  await gallery
    .getByRole("button", { name: "Create EN page", exact: true })
    .click();
  await expect(
    manager
      .getByRole("combobox", { name: "Page", exact: true })
      .locator("option:checked"),
  ).toHaveText("Gallery");
  await manager
    .getByRole("button", { name: "Add section", exact: true })
    .click();
  await manager.getByRole("button", { name: "Add Image", exact: true }).click();
  await manager
    .getByRole("button", { name: "Choose image", exact: true })
    .first()
    .click();
  const picker = manager.getByRole("dialog", {
    name: "Choose an image",
    exact: true,
  });
  await expect(
    picker.getByRole("tab", { name: "Upload image", exact: true }),
  ).toHaveCount(0);
  await picker.getByRole("button", { name: /Synthetic event image/ }).click();
  await picker
    .getByRole("button", { name: "Insert image", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(
    manager.getByText("Draft saved. Your public page has not changed."),
  ).toBeVisible();
  await Promise.all([
    manager.waitForEvent("dialog").then((dialog) => dialog.accept()),
    manager
      .getByRole("button", { name: "Publish changes", exact: true })
      .click(),
  ]);
  await expect(
    manager.getByText("Published. Guests now see this event and page."),
  ).toBeVisible();
  await visitor.goto(url);
  await navigation.getByRole("link", { name: "Gallery", exact: true }).click();
  await expect(visitor.locator(`img[src="/media/${asset.id}"]`)).toBeVisible();
  await visitor.setViewportSize({ width: 1440, height: 1000 });
  await visitor.screenshot({
    path: ".local/event-public-desktop.png",
    fullPage: true,
  });
  await visitor.setViewportSize({ width: 390, height: 844 });
  expect(
    await visitor.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await visitor.screenshot({
    path: ".local/event-public-phone.png",
    fullPage: true,
  });

  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: ".local/event-features-desktop.png" });
  await manager.setViewportSize({ width: 390, height: 844 });
  expect(
    await manager.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel.screenshot({ path: ".local/event-features-phone.png" });
  manager.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("suspended");
    await dialog.accept();
  });
  await panel
    .getByRole("button", { name: "Disable Website", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Enable Website", exact: true }),
  ).toBeVisible();
  expect(
    (await visitor.request.get(url.replace("website", "gallery"))).status(),
  ).toBe(404);
  manager.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Enable Website", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Disable Website", exact: true }),
  ).toBeVisible();
  await visitor.goto(url);
  await expect(
    navigation.getByRole("link", { name: "Gallery", exact: true }),
  ).toHaveCount(0);
  manager.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Enable Gallery", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Disable Gallery", exact: true }),
  ).toBeVisible();
  await visitor.goto(url);
  await expect(
    navigation.getByRole("link", { name: "Gallery", exact: true }),
  ).toBeVisible();
  const saved = (await manager.request
    .get(`/api/admin/cms/content/${id}?locale=en`)
    .then((r) => r.json())) as CmsDetail;
  expect(saved.event?.id).toBe(eventId);
  await anonymous.close();
}
