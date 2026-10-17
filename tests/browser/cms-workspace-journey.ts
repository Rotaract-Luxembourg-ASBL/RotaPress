import { expect, type Page } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import type { AdminMediaAssetDto } from "../../src/features/media/media_schemas";
import type { AlbumDetail } from "../../src/features/media/album_schemas";
import { pageTreeJourney } from "./page-tree-journey";
import { editorGroupsPatternsJourney } from "./editor-groups-patterns-journey";
import { pageCollectionRecoveryJourney } from "./page-collection-recovery-journey";

/** B02: direct selection, recoverable editing and shared album publication. */
export async function cmsWorkspaceJourney(
  page: Page,
  visitor: Page,
  origin: string,
) {
  const post = async <T>(url: string, data: object) => {
    const response = await page.request.post(url, {
      headers: { origin },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as T;
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/website?tab=pages&locale=en&collection=all");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  const creation = page.getByRole("dialog", { name: "New page", exact: true });
  await creation
    .getByLabel("Title", { exact: true })
    .fill("Workspace controls alpha");
  await expect(creation.getByLabel("URL slug", { exact: true })).toHaveCount(0);
  const layout = creation.getByRole("combobox", {
    name: "Page layout",
    exact: true,
  });
  const sampleLayout = await layout
    .locator("option")
    .nth(1)
    .getAttribute("value");
  const [layoutResponse] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/admin/website/preview" &&
        url.searchParams.has("layout")
      );
    }),
    layout.selectOption(sampleLayout!),
  ]);
  expect(layoutResponse.ok()).toBe(true);
  expect(layoutResponse.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(layoutResponse.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'self'",
  );
  await expect(
    creation
      .frameLocator('iframe[title="Selected page layout preview"]')
      .locator(".cms-public"),
  ).toBeVisible();
  await layout.selectOption("blank");
  await expect(
    creation.getByRole("img", { name: "Blank page preview" }),
  ).toBeVisible();
  await creation
    .getByRole("button", { name: "Create draft", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/website\/[a-f0-9-]+\?locale=en/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const canvas = page.frameLocator(".editor-canvas iframe");
  const library = page.getByRole("complementary", { name: "Block library" });
  const openLibrary = async () => {
    const toggle = page.getByRole("button", {
      name: "Add blocks",
      exact: true,
    });
    // New blank pages already open the library; wait for the editor before reading it.
    await expect(toggle).toBeEnabled();
    if ((await toggle.getAttribute("aria-pressed")) === "false")
      await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(library).toBeVisible();
  };
  await openLibrary();
  await library
    .getByRole("searchbox", { name: "Search blocks" })
    .fill("heading");
  await library
    .getByRole("button", { name: "Add Heading block", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Heading text", exact: true })
    .fill("Recovered heading");
  await expect(page.getByText(/Recovery saved /)).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Recover my changes", exact: true })
    .click();
  await expect(
    canvas.getByRole("heading", { name: "Recovered heading", exact: true }),
  ).toBeVisible();
  await openLibrary();
  await library
    .getByRole("searchbox", { name: "Search blocks" })
    .fill("heading");
  await library
    .getByRole("button", { name: "Add Heading block", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Heading text", exact: true })
    .fill("Second heading");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  const outline = page.getByRole("complementary", { name: "Page outline" });
  await outline
    .getByRole("checkbox", { name: "Select all in this group" })
    .check();
  await outline.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(canvas.locator(".cms-heading")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Undo block edit", exact: true })
    .click();
  await expect(canvas.locator(".cms-heading")).toHaveCount(2);
  await editorGroupsPatternsJourney(page, id, origin);
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await canvas
    .getByRole("heading", { name: "Recovered heading", exact: true })
    .click();
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Screen size", exact: true })
    .selectOption("tablet");
  await page
    .getByRole("combobox", { name: "Text size", exact: true })
    .selectOption("regular");
  await page
    .getByRole("combobox", { name: "Screen size", exact: true })
    .selectOption("mobile");
  await expect(
    page.getByRole("combobox", { name: "Text size", exact: true }),
  ).toContainText("Inherited: Regular · 20 px (Tablet)");
  await page
    .getByRole("combobox", { name: "Text size", exact: true })
    .selectOption("large");
  await page
    .getByRole("combobox", { name: "Text alignment", exact: true })
    .selectOption("right");
  const responsiveHeading = canvas.getByRole("heading", {
    name: "Recovered heading",
    exact: true,
  });
  await page
    .getByRole("button", { name: "Tablet canvas width", exact: true })
    .click();
  await expect(responsiveHeading).toHaveCSS("font-size", "20px");
  await page
    .getByRole("button", { name: "Mobile canvas width", exact: true })
    .click();
  expect(
    await canvas
      .locator("body")
      .evaluate((node) => node.ownerDocument.defaultView?.innerWidth),
  ).toBe(390);
  await expect(canvas.locator(".cms-heading").first()).toHaveCSS(
    "text-align",
    "right",
  );
  await expect(responsiveHeading).toHaveCSS("font-size", "28px");
  await canvas
    .getByRole("heading", { name: "Recovered heading", exact: true })
    .click();
  await page.keyboard.press("Control+s");
  await expect(
    page.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  const saved = (await page.request
    .get(`/api/admin/cms/content/${id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  expect(saved.draft.slug).toBe("workspace-controls-alpha");
  await expect
    .poll(
      async () =>
        (
          await page.request
            .get(`/api/admin/cms/content/${id}/checkpoint?locale=en`)
            .then((response) => response.json())
        ).checkpoint,
    )
    .toBeNull();
  await page.getByLabel("More page actions", { exact: true }).click();
  await page.getByRole("button", { name: /^Revision history/ }).click();
  const history = page.getByRole("dialog", {
    name: "Revision history",
    exact: true,
  });
  await history
    .getByRole("button", { name: "Compare", exact: true })
    .last()
    .click();
  await expect(
    history.getByRole("region", { name: "Revision comparison" }),
  ).toContainText("Recovered heading");
  await history
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  const beta = await post<CmsDetail>("/api/admin/cms/content", {
    kind: "page",
    locale: "en",
    title: "Workspace controls beta",
  });
  await page.goto(
    "/admin/website?tab=pages&locale=en&collection=all&search=Workspace%20controls",
  );
  await page
    .getByRole("checkbox", { name: "Select all shown", exact: true })
    .check();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const publication = page.getByRole("dialog", {
    name: "Publish 2 pages",
    exact: true,
  });
  const [published] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/admin/cms/pages/batch" &&
        response.request().method() === "POST",
    ),
    publication.getByRole("button", { name: "Publish", exact: true }).click(),
  ]);
  expect(published.ok(), await published.text()).toBe(true);
  await expect(publication).not.toBeVisible();
  expect(
    (await visitor.request.get(`/pages/en/${saved.draft.slug}`)).status(),
  ).toBe(200);
  expect(
    (await visitor.request.get(`/pages/en/${beta.draft.slug}`)).status(),
  ).toBe(200);
  await page
    .getByRole("checkbox", { name: "Select all shown", exact: true })
    .check();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Archive 2 pages", exact: true })
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Publication status" })
    .getByRole("button", { name: /Archived/ })
    .click();
  await page
    .getByRole("checkbox", { name: "Select all shown", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Restore from archive", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Restore from archive 2 pages", exact: true })
    .getByRole("button", { name: "Restore from archive", exact: true })
    .click();
  expect(
    (await visitor.request.get(`/pages/en/${saved.draft.slug}`)).status(),
  ).toBe(404);
  await pageTreeJourney(page, saved, beta);
  await pageCollectionRecoveryJourney(page, origin);
  await linkedGalleryLightbox(page, visitor, origin);
}

async function linkedGalleryLightbox(
  page: Page,
  visitor: Page,
  origin: string,
) {
  const mutate = async <T>(url: string, data: object, method = "POST") => {
    const response = await page.request.fetch(url, {
      method,
      headers: { origin },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as T;
  };
  const assets = (await page.request
    .get("/api/admin/media?visibility=public&kind=image&pageSize=2")
    .then((response) => response.json())) as { assets: AdminMediaAssetDto[] };
  expect(assets.assets.length).toBe(2);
  let album = await mutate<AlbumDetail>("/api/admin/media/albums", {
    title: "Linked browser album",
    items: assets.assets.map((asset, index) => ({
      assetId: asset.id,
      alt: `Album photograph ${index + 1}`,
      caption: `Caption ${index + 1}`,
      focalX: index ? 75 : 25,
      focalY: 40,
    })),
    layout: "slider",
    lightbox: true,
  });
  album = await mutate<AlbumDetail>(
    `/api/admin/media/albums/${album.id}/publication`,
    { expectedVersion: album.version },
  );
  let detail = await mutate<CmsDetail>("/api/admin/cms/content", {
    kind: "page",
    locale: "en",
    title: "Linked gallery browser",
    slug: "linked-gallery-browser",
  });
  detail = await mutate<CmsDetail>(`/api/admin/cms/content/${detail.id}/save`, {
    locale: "en",
    expectedRevisionId: detail.draft.id,
    title: detail.draft.title,
    slug: detail.draft.slug,
    description: "",
    socialImageId: null,
    data: {
      root: { props: {} },
      content: [
        {
          type: "Gallery",
          props: {
            id: "linked-gallery",
            version: 1,
            albumId: album.id,
            items: [],
          },
        },
      ],
    },
  });
  await mutate(`/api/admin/cms/content/${detail.id}/publish`, {
    locale: "en",
    expectedRevisionId: detail.draft.id,
  });
  await visitor.goto("/pages/en/linked-gallery-browser");
  const slider = visitor.getByRole("region", {
    name: "Photo album slider",
    exact: true,
  });
  await expect(slider.locator(".cms-image")).toHaveCount(1);
  await expect(slider.locator(".cms-image")).toHaveCSS(
    "object-position",
    "25% 40%",
  );
  await slider
    .getByRole("button", { name: "Next photograph", exact: true })
    .click();
  await expect(slider).toContainText("Caption 2");
  await slider
    .getByRole("button", { name: "Previous photograph", exact: true })
    .click();
  const trigger = visitor.getByRole("button", {
    name: "Enlarge image 1: Album photograph 1",
    exact: true,
  });
  await trigger.click();
  const lightbox = visitor.getByRole("dialog", {
    name: "Image 1 of 2",
    exact: true,
  });
  await expect(lightbox).toBeVisible();
  await visitor.keyboard.press("ArrowRight");
  await expect(
    visitor.getByRole("dialog", { name: "Image 2 of 2", exact: true }),
  ).toContainText("Caption 2");
  await visitor.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  album = await mutate<AlbumDetail>(
    `/api/admin/media/albums/${album.id}`,
    {
      expectedVersion: album.version,
      data: {
        ...album.draft,
        layout: "masonry",
        items: album.draft.items.map((item, index) => ({
          ...item,
          caption: index ? item.caption : "Updated album caption",
        })),
      },
    },
    "PATCH",
  );
  await mutate(`/api/admin/media/albums/${album.id}/publication`, {
    expectedVersion: album.version,
  });
  await visitor.reload();
  await expect(
    visitor.getByText("Updated album caption", { exact: true }),
  ).toBeVisible();
  await expect(visitor.locator(".cms-gallery")).toHaveAttribute(
    "data-gallery-layout",
    "masonry",
  );
  await visitor.setViewportSize({ width: 390, height: 844 });
  expect(
    await visitor.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await visitor.screenshot({
    path: ".local/cms-linked-gallery-phone.png",
    fullPage: true,
  });
}
