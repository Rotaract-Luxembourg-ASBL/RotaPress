import { expect, type Page } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";

/** B02: native multi-photo gallery composition retains order and captions after saving. */
export async function mediaGalleryJourney(
  page: Page,
  visitor: Page,
  origin: string,
) {
  const created = await page.request.post("/api/admin/cms/content", {
    headers: { origin },
    data: {
      kind: "page",
      locale: "en",
      title: "Photo gallery controls",
      slug: "photo-gallery-controls",
      templateId: "blank",
    },
  });
  expect(created.status()).toBe(201);
  const content = (await created.json()) as CmsDetail;
  const url = `/admin/website/${content.id}?locale=en`;
  await page.goto(url);
  await expect(page.locator(".editor-toolbar")).toBeVisible();
  const blockLibrary = page.getByRole("complementary", {
    name: "Block library",
  });
  if (!(await blockLibrary.isVisible()))
    await page.getByRole("button", { name: "Add blocks", exact: true }).click();
  await blockLibrary
    .getByRole("searchbox", { name: "Search blocks" })
    .fill("gallery");
  await blockLibrary
    .getByRole("button", { name: "Add Gallery block", exact: true })
    .click();
  const createGallery = page.getByRole("button", {
    name: "Create gallery",
    exact: true,
  });
  await createGallery.click();
  const gallery = page.getByRole("dialog", {
    name: "Create gallery",
    exact: true,
  });
  const search = gallery.getByRole("searchbox", {
    name: "Search media",
    exact: true,
  });
  for (const title of ["Synthetic club image", "private-gallery-fixture"]) {
    await search.fill(title);
    await gallery
      .getByRole("checkbox", { name: `Select ${title}`, exact: true })
      .check();
  }
  await gallery.getByRole("tab", { name: "Edit gallery", exact: true }).click();
  await gallery
    .getByLabel("Caption for image 1", { exact: true })
    .fill("Public club photo");
  await gallery
    .getByLabel("Alternative text for image 2", { exact: true })
    .fill("Private gallery test photograph");
  await gallery
    .getByLabel("Caption for image 2", { exact: true })
    .fill("Private photo caption");
  await gallery
    .getByRole("button", { name: "Move image 2 up", exact: true })
    .click();
  await expect(
    gallery.getByLabel("Caption for image 1", { exact: true }),
  ).toHaveValue("Private photo caption");
  await gallery.screenshot({
    path: ".local/media-gallery-composer-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await gallery.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await gallery.screenshot({ path: ".local/media-gallery-composer-phone.png" });
  await gallery
    .getByRole("button", { name: "Insert gallery", exact: true })
    .click();
  await expect(gallery).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Save draft", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed."),
  ).toBeVisible();
  const saved = (await page.request
    .get(`/api/admin/cms/content/${content.id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  const block = saved.draft.data.content.find(
    (item) => item.type === "Gallery",
  )!;
  expect(block.type).toBe("Gallery");
  if (block.type !== "Gallery") throw new Error("Missing saved gallery");
  expect(block.props.items).toHaveLength(2);
  expect(block.props.items.map((item) => item.caption)).toEqual([
    "Private photo caption",
    "Public club photo",
  ]);
  expect(block.props.items[0].alt).toBe("Private gallery test photograph");
  expect(
    (await visitor.request.get("/pages/en/photo-gallery-controls")).status(),
  ).toBe(404);
  await page.reload();
  await page.locator(".editor-canvas .cms-gallery img").first().click();
  await page.getByRole("button", { name: "Edit gallery", exact: true }).click();
  const editing = page.getByRole("dialog", {
    name: "Edit gallery",
    exact: true,
  });
  await editing.getByRole("tab", { name: "Edit gallery", exact: true }).click();
  await expect(
    editing.getByLabel("Caption for image 1", { exact: true }),
  ).toHaveValue("Private photo caption");
  await editing
    .getByRole("button", { name: "Remove image 2", exact: true })
    .click();
  await editing
    .getByRole("button", { name: "Update gallery", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save draft", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed."),
  ).toBeVisible();
  const updated = (await page.request
    .get(`/api/admin/cms/content/${content.id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  const final = updated.draft.data.content.find(
    (item) => item.type === "Gallery",
  );
  if (final?.type !== "Gallery") throw new Error("Missing updated gallery");
  expect(final.props.items).toHaveLength(1);
  expect(final.props.items[0].caption).toBe("Private photo caption");
}
