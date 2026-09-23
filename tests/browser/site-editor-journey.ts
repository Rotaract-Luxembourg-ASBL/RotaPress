import { expect, type Page } from "@playwright/test";
import type { CmsDetail, SiteDraft } from "../../src/features/cms/cms_schemas";
import {
  publishWebsite,
  saveWebsiteSettings,
} from "./website-workspace-journey";

export async function siteEditorJourney({
  page,
  publicPage,
  origin,
  homeId,
  assetId,
}: {
  page: Page;
  publicPage: Page;
  origin: string;
  homeId: string;
  assetId: string;
}) {
  const detail = async (id: string) =>
    (await page.request
      .get(`/api/admin/cms/content/${id}?locale=en`)
      .then((r) => r.json())) as CmsDetail;
  const save = async () => {
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(
      page.getByText("Draft saved. Your public page has not changed.", {
        exact: true,
      }),
    ).toBeVisible();
  };
  const created = await page.request.post("/api/admin/cms/content", {
    headers: { origin },
    data: {
      kind: "page",
      locale: "en",
      title: "Shared layout example",
      slug: "shared-layout",
    },
  });
  expect(created.status()).toBe(201);
  const second = (await created.json()) as CmsDetail;
  expect(
    (
      await page.request.post(`/api/admin/cms/content/${second.id}/publish`, {
        headers: { origin },
        data: { locale: "en", expectedRevisionId: second.draft.id },
      })
    ).ok(),
  ).toBe(true);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/website?tab=parts");
  await page
    .getByRole("button", { name: "Create header draft", exact: true })
    .click();
  await saveWebsiteSettings(page);
  await page.getByRole("link", { name: "Edit header", exact: true }).click();
  await expect(page.locator(".editor-toolbar")).toBeVisible();
  const headerId = new URL(page.url()).pathname.split("/").pop()!;
  let header = await detail(headerId);
  const originalRevision = header.draft.id;
  const row = header.draft.data.content[0];
  if (row.type !== "SiteRow") throw new Error("Expected shared row");
  const logoId = row.props.left[0].props.id;
  await expect(
    page.getByRole("heading", { name: "Shared header settings", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Shared layout example", { exact: false }),
  ).toBeVisible();
  await page.locator(`[data-puck-component="${logoId}"]`).click();
  await page
    .getByRole("textbox", {
      name: "Name (blank uses club identity)",
      exact: true,
    })
    .fill("Our community club");
  await page.getByRole("button", { name: "Choose image", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: "Choose an image",
    exact: true,
  });
  await picker.getByRole("button", { name: /Synthetic club image/ }).click();
  await picker
    .getByRole("button", { name: "Insert image", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Logo alternative text", exact: true })
    .fill("Club logo");
  await save();
  header = await detail(headerId);
  expect(JSON.stringify(header.draft.data)).toContain(assetId);
  await publicPage.goto(`${origin}/pages/en/shared-layout`);
  await expect(
    publicPage.getByText("Our community club", { exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await publicPage.request.get(
        `${origin}/api/admin/cms/site/context?locale=en`,
      )
    ).status(),
  ).toBe(401);
  await publicPage.goto(
    `${origin}/admin/website/${headerId}/preview?locale=en`,
  );
  await expect(publicPage).toHaveURL(/\/sign-in/);
  const previewPromise = page.waitForEvent("popup");
  await page.getByLabel(/More .* actions/).click();
  await page.getByRole("link", { name: /Preview saved draft/ }).click();
  const preview = await previewPromise;
  await expect(
    preview.getByText(/Private shared header preview/),
  ).toBeVisible();
  await expect(preview.locator("header .site-brand")).toContainText(
    "Our community club",
  );
  const response = await page.request.get(
    `/admin/website/${headerId}/preview?locale=en`,
  );
  expect(response.headers()["cache-control"]).toMatch(/no-store/);
  await preview.setViewportSize({ width: 1440, height: 1000 });
  await preview.screenshot({ path: ".local/site-header-preview-desktop.png" });
  await preview.setViewportSize({ width: 390, height: 844 });
  await preview.locator("header summary").click();
  await expect(
    preview
      .locator("header")
      .getByRole("link", { name: "Our home", exact: true }),
  ).toBeVisible();
  await preview.screenshot({ path: ".local/site-header-preview-phone.png" });
  await preview.close();
  await page.goto("/admin/website?tab=parts");
  await publishWebsite(page);
  for (const slug of ["home", "shared-layout"]) {
    await publicPage.goto(`${origin}/pages/en/${slug}`);
    await expect(publicPage.locator("header .site-brand")).toContainText(
      "Our community club",
    );
  }

  await page.goto("/admin/website?tab=parts");
  await page
    .getByRole("button", { name: "Create footer draft", exact: true })
    .click();
  await saveWebsiteSettings(page);
  await page.getByRole("link", { name: "Edit footer", exact: true }).click();
  await expect(page.locator(".editor-toolbar")).toBeVisible();
  const footerId = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByRole("button", { name: "Add blocks", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Insert into", exact: true })
    .selectOption({ label: "Row 1 · center column" });
  await page
    .getByRole("button", { name: "Add Contact details block", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill("Visit the club");
  await page
    .getByRole("textbox", { name: "Address", exact: true })
    .fill("Synthetic community hall");
  await page
    .getByRole("textbox", { name: "Contact email", exact: true })
    .fill("club@example.test");
  await page
    .getByRole("textbox", { name: "Contact phone", exact: true })
    .fill("+352 000 000");
  await page
    .getByRole("button", { name: "Duplicate block", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Undo block edit", exact: true })
    .click();
  await save();
  const footer = await detail(footerId);
  const footerRow = footer.draft.data.content[0];
  if (footerRow.type !== "SiteRow") throw new Error("Expected footer columns");
  expect(
    footerRow.props.center.filter((item) => item.type === "SiteContact"),
  ).toHaveLength(1);
  const footerPreviewPromise = page.waitForEvent("popup");
  await page.getByLabel(/More .* actions/).click();
  await page.getByRole("link", { name: /Preview saved draft/ }).click();
  const footerPreview = await footerPreviewPromise;
  await expect(
    footerPreview.getByText(/Private shared footer preview/),
  ).toBeVisible();
  await expect(footerPreview.locator("footer")).toContainText("Visit the club");
  await footerPreview.setViewportSize({ width: 1440, height: 1000 });
  await footerPreview.locator("footer").scrollIntoViewIfNeeded();
  await footerPreview.screenshot({
    path: ".local/site-footer-preview-desktop.png",
  });
  await footerPreview.setViewportSize({ width: 390, height: 844 });
  await footerPreview.locator("footer").scrollIntoViewIfNeeded();
  await footerPreview.screenshot({
    path: ".local/site-footer-preview-phone.png",
  });
  await footerPreview.close();
  await page
    .getByRole("button", { name: "Desktop canvas width", exact: true })
    .click();
  await page.screenshot({ path: ".local/site-editor-desktop.png" });
  await page
    .getByRole("button", { name: "Mobile canvas width", exact: true })
    .click();
  await page.screenshot({ path: ".local/site-editor-mobile-canvas.png" });
  await page.goto("/admin/website?tab=parts");
  await publishWebsite(page);
  await page.getByRole("link", { name: "Edit footer", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const closeSettings = page.getByRole("button", {
    name: "Close settings",
    exact: true,
  });
  if (await closeSettings.isVisible()) await closeSettings.click();
  await page.screenshot({ path: ".local/site-editor-phone.png" });

  for (const width of [1440, 390, 320]) {
    await publicPage.setViewportSize({
      width,
      height: width === 1440 ? 1000 : 844,
    });
    await publicPage.goto(`${origin}/pages/en/shared-layout`);
    await expect(publicPage.locator("footer")).toContainText("Visit the club");
    expect(
      await publicPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width < 600) await publicPage.locator("header summary").click();
    await expect(
      publicPage
        .locator("header")
        .getByRole("link", { name: "Our home", exact: true }),
    ).toBeVisible();
    if (width !== 320)
      await publicPage.screenshot({
        path: `.local/site-published-${width === 1440 ? "desktop" : "phone"}.png`,
        fullPage: true,
      });
  }
  // Updating the referenced menu does not require republishing either site part.
  const site = (await page.request
    .get("/api/admin/cms/site?locale=en")
    .then((r) => r.json())) as SiteDraft;
  const menu = await page.request.post("/api/admin/cms/site", {
    headers: { origin },
    data: {
      locale: "en",
      expectedVersion: site.version,
      settings: {
        ...site.published,
        navigation: [{ pageId: homeId, label: "Club home" }],
      },
    },
  });
  expect(menu.ok()).toBe(true);
  await publicPage.reload();
  await expect(
    publicPage
      .locator("header")
      .getByRole("link", { name: "Club home", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.post("/api/admin/cms/site/publish", {
        headers: { origin },
        data: {
          locale: "en",
          expectedVersion: ((await menu.json()) as SiteDraft).version,
        },
      })
    ).ok(),
  ).toBe(true);
  await publicPage.reload();
  await publicPage.locator("header summary").click();
  await publicPage
    .locator("header")
    .getByRole("link", { name: "Club home", exact: true })
    .click();
  await expect(publicPage).toHaveURL(/\/pages\/en\/home$/);
  expect((await detail(headerId)).draft.id).toBe(header.draft.id);
  // Restore via the existing revision UI; the live header stays customized.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/admin/website/${headerId}?locale=en`);
  await page.locator("summary[aria-label='More shared part actions']").click();
  await page.getByRole("button", { name: /Revision history/ }).click();
  await page
    .getByRole("button", { name: "Restore to draft", exact: true })
    .and(page.locator(":enabled"))
    .click();
  await expect
    .poll(async () => (await detail(headerId)).draft.id)
    .not.toBe(header.draft.id);
  expect((await detail(headerId)).draft.id).not.toBe(originalRevision);
  await publicPage.reload();
  await expect(publicPage.locator("header .site-brand")).toContainText(
    "Our community club",
  );
  await expect(
    page.getByRole("dialog", { name: "Revision history", exact: true }),
  ).not.toBeVisible();
}
