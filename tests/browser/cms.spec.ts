import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { test, expect, type Page } from "@playwright/test";
import { adminCollectionsJourney } from "./admin-collections-journey";
import { formStudioJourney } from "./form-studio-journey";
import { Pool } from "pg";
import sharp from "sharp";
import type { CmsDetail, CmsSummary } from "../../src/features/cms/cms_schemas";
import { formsJourney } from "./forms-journey";
import { appearanceJourney } from "./appearance-journey";
import { siteEditorJourney } from "./site-editor-journey";
import { publicationJourney } from "./publication-journey";
import { partnersJourney } from "./partners-journey";
import { communityJourney } from "./community-journey";
import { clubFeaturesJourney } from "./club-features-journey";
import { pageSettingsJourney } from "./page-settings-journey";
import { kitJourney } from "./kit-journey";
import { brandingJourney } from "./branding-journey";
import { websitePublicationJourney } from "./website-publication-journey";
import { eventDirectoryJourney } from "./event-directory-journey";
import { calendarJourney } from "./calendar-journey";
import { emailJourney } from "./email-journey";
import { formEmailJourney } from "./email-scope-journey";
import {
  publishWebsite,
  saveWebsiteSettings,
} from "./website-workspace-journey";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";

const ownerEmail = `cms-owner-${randomUUID()}@example.test`;
const claim = randomBytes(32).toString("base64url");
const origin = smokeOrigin;
let database: Pool;

test.use({ actionTimeout: 10_000 });

test.beforeAll(async () => {
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  if (!env.TEST_MIGRATION_DATABASE_URL)
    throw new Error("Run local setup first.");
  const target = new URL(env.TEST_MIGRATION_DATABASE_URL);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "55432" ||
    target.pathname !== "/rotapress_test"
  ) {
    throw new Error(
      "CMS browser checks require the dedicated disposable local test database.",
    );
  }
  database = new Pool({ connectionString: env.TEST_MIGRATION_DATABASE_URL });
  await database.query(
    'TRUNCATE club.installation, club.organization, club.membership, club.audit_entry, club.rate_limit, club.verification, club."user" CASCADE',
  );
  await database.query(
    "INSERT INTO club.installation (id,nominated_email,claim_hash,claim_expires_at) VALUES (1,$1,$2,now()+interval '10 minutes')",
    [ownerEmail, createHash("sha256").update(claim).digest("hex")],
  );
});
test.afterAll(async () => {
  await database?.end();
});

async function signInOwner(page: Page) {
  await page.goto("/sign-in?next=/setup");
  await expect(page.getByLabel("Your name")).toHaveCount(0);
  await page.getByLabel("Email address").fill(ownerEmail);
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();
  let code = "";
  await expect
    .poll(async () => {
      const mailbox = (await fetch(
        "http://127.0.0.1:18025/api/v1/messages",
      ).then((response) => response.json())) as {
        messages: Array<{ ID: string; To: Array<{ Address: string }> }>;
      };
      const mail = mailbox.messages.find((item) =>
        item.To.some((recipient) => recipient.Address === ownerEmail),
      );
      if (!mail) return false;
      const detail = (await fetch(
        `http://127.0.0.1:18025/api/v1/message/${mail.ID}`,
      ).then((response) => response.json())) as { Text: string };
      code = detail.Text.match(/\b\d{6}\b/)?.[0] ?? "";
      return Boolean(code);
    })
    .toBe(true);
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(`${origin}/setup`);
  const setup = await page.request.post("/api/setup", {
    headers: { origin },
    data: {
      claim,
      name: "Synthetic CMS Club",
      tagline: "Our community",
      description: "A synthetic browser verification club.",
      locale: "en",
      timezone: "Europe/Luxembourg",
      accentColor: "#a84432",
    },
  });
  expect(setup.status()).toBe(201);
}

test("B02: Puck editing, private media, reusable forms and submissions", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  page.on("dialog", (dialog) => dialog.accept());
  await signInOwner(page);
  const anonymousContext = await browser.newContext();
  const publicPage = await anonymousContext.newPage();
  expect(
    (await publicPage.request.get("/api/admin/cms/content")).status(),
  ).toBe(401);
  await page.goto("/admin/website?tab=pages");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  const newPage = page.getByRole("dialog", { name: "New page", exact: true });
  await newPage
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Home");
  await newPage.getByRole("textbox", { name: /^URL slug/ }).fill("home");
  await newPage
    .getByRole("combobox", { name: /^Page layout/ })
    .selectOption("home");
  await newPage
    .getByRole("button", { name: "Create draft", exact: true })
    .click();
  await expect(page.locator(".editor-toolbar")).toBeVisible();
  const { items } = (await page.request
    .get("/api/admin/cms/content")
    .then((response) => response.json())) as { items: CmsSummary[] };
  const home = items.find((item) => item.slug === "home")!;
  // Creating drafts must leave the existing public identity homepage intact.
  expect((await publicPage.request.get("/")).status()).toBe(200);
  expect((await publicPage.request.get("/pages/en/home")).status()).toBe(404);
  await page.goto(`/admin/website/${home.id}?locale=en`);
  await expect(page.locator(".admin-sidebar")).toHaveCount(0);
  await expect(page.locator(".editor-toolbar")).toBeVisible();
  expect(
    await page
      .locator(".editor-workspace")
      .evaluate((element) => element.getBoundingClientRect().top),
  ).toBe(0);
  await expect(page.getByLabel("Page title", { exact: true })).toHaveValue(
    "Home",
  );
  await page
    .locator(".cms-puck")
    .getByRole("heading", { name: "Good people. Shared purpose." })
    .click();
  await expect(
    page.getByRole("tab", { name: "Block", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .locator(".editor-canvas h1 [contenteditable='plaintext-only']")
    .fill("Our published welcome");
  await page.getByRole("textbox", { name: "Heading", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Heading", exact: true }),
  ).toHaveValue("Our published welcome");
  // A history shortcut during an in-flight save must not desynchronize the
  // canvas from the saved revision. Hold only this request, not a timed sleep.
  let releaseSave = () => {};
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route(
    `**/api/admin/cms/content/${home.id}/save`,
    async (route) => {
      await saveGate;
      await route.continue();
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Save draft", exact: true })
    .first()
    .click();
  await expect(page.locator(".editor-body")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page.keyboard.press("Control+z");
  releaseSave();
  await expect(
    page.getByText("Draft saved. Your public page has not changed."),
  ).toBeVisible();
  await expect(page.locator(".editor-canvas .cms-hero h1")).toHaveText(
    "Our published welcome",
  );
  expect((await publicPage.request.get("/pages/en/home")).status()).toBe(404);
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByText("Published. The website now shows this saved revision."),
  ).toBeVisible();
  await publicPage.goto("/pages/en/home");
  await expect(
    publicPage.getByRole("heading", {
      name: "Our published welcome",
      exact: true,
    }),
  ).toBeVisible();

  await page.goto("/admin/website?tab=menus");
  await page.getByRole("combobox", { name: /^Homepage/ }).selectOption(home.id);
  await saveWebsiteSettings(page);
  await publishWebsite(page);
  await page.goto(`/admin/website/${home.id}?locale=en`);
  await pageSettingsJourney(page, publicPage, home.id);

  await page
    .locator(".cms-puck")
    .getByRole("heading", { name: "Our published welcome" })
    .click();
  await page
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill("Still a private draft");
  await page
    .getByRole("button", { name: "Save draft", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed."),
  ).toBeVisible();
  await publicPage.reload();
  await expect(
    publicPage.getByRole("heading", {
      name: "Our published welcome",
      exact: true,
    }),
  ).toBeVisible();
  await expect(publicPage.getByText("Still a private draft")).toHaveCount(0);
  const latest = (await page.request
    .get(`/api/admin/cms/content/${home.id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  const competing = await page.request.post(
    `/api/admin/cms/content/${home.id}/save`,
    {
      headers: { origin },
      data: {
        locale: "en",
        expectedRevisionId: latest.draft.id,
        title: "Another editor saved",
        slug: "home",
        description: latest.draft.description,
        socialImageId: null,
        data: latest.draft.data,
      },
    },
  );
  expect(competing.status()).toBe(200);
  await page.getByRole("tab", { name: "Page", exact: true }).click();
  await page
    .getByLabel("Page title", { exact: true })
    .fill("Keep my entered title");
  await page
    .getByRole("button", { name: "Save draft", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Another editor saved" }),
  ).toBeVisible();
  await expect(page.getByLabel("Page title", { exact: true })).toHaveValue(
    "Keep my entered title",
  );

  await page.reload();
  await page.getByLabel("More page actions", { exact: true }).click();
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(
    page.getByText("Unpublished. The content is no longer public."),
  ).toBeVisible();
  expect((await publicPage.request.get("/pages/en/home")).status()).toBe(404);
  expect((await publicPage.request.get("/")).status()).toBe(404);

  await page.goto("/admin/media");
  await page
    .getByRole("button", { name: "Upload images", exact: true })
    .click();
  const png = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "#a84432" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("Image file").setInputFiles({
    name: "synthetic-club.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByLabel("Title", { exact: true }).fill("Synthetic club image");
  await page
    .getByLabel("Alternative text", { exact: true })
    .fill("A terracotta synthetic test image");
  await page.getByRole("button", { name: "Upload private image" }).click();
  await expect(
    page.getByText("Image uploaded privately.", { exact: false }),
  ).toBeVisible();
  const assets = (await page.request
    .get("/api/admin/media")
    .then((response) => response.json())) as { assets: Array<{ id: string }> };
  const assetId = assets.assets[0].id;
  expect(
    (await publicPage.request.get(`/api/admin/media/${assetId}`)).status(),
  ).toBe(401);
  expect((await publicPage.request.get(`/media/${assetId}`)).status()).toBe(
    404,
  );
  const privateImage = await page.request.get(`/media/${assetId}`);
  expect(privateImage.status()).toBe(200);
  expect(privateImage.headers()["cache-control"]).toContain("no-store");
  expect(privateImage.headers()["content-type"]).toBe("image/webp");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: /Synthetic club image/ }).click();
  await page
    .getByRole("combobox", { name: /Visibility/ })
    .last()
    .selectOption("public");
  await page.getByRole("button", { name: "Save image details" }).click();
  await expect(page.getByText("Image details saved.")).toBeVisible();
  expect((await publicPage.request.get(`/media/${assetId}`)).status()).toBe(
    200,
  );

  await page.goto(`/admin/website/${home.id}?locale=en`);
  await page
    .getByRole("button", { name: "Choose image", exact: true })
    .first()
    .click();
  const picker = page.getByRole("dialog", {
    name: "Choose an image",
    exact: true,
  });
  await picker.getByRole("button", { name: /Synthetic club image/ }).click();
  await picker
    .getByRole("button", { name: "Insert image", exact: true })
    .click();
  // Insert exactly between the existing Hero and Rich Text blocks.
  await page.locator(".editor-canvas .cms-hero h1").click();
  await page
    .getByRole("button", { name: "Add block after Hero", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Image block", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Block", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Choose image", exact: true }).click();
  await picker
    .getByRole("searchbox", { name: "Search media" })
    .fill("Synthetic club");
  await picker.getByRole("button", { name: /Synthetic club image/ }).click();
  await picker
    .getByRole("button", { name: "Insert image", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Alternative text", exact: true })
    .fill("An image inserted between two blocks");
  await page
    .getByRole("combobox", { name: "Image shape" })
    .selectOption({ label: "Landscape · 4:3" });
  await page
    .getByRole("button", { name: "Move block down", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move block up", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Duplicate block", exact: true })
    .click();
  await expect(page.locator(".editor-canvas img")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Undo block edit", exact: true })
    .click();
  await expect(page.locator(".editor-canvas img")).toHaveCount(1);
  const imageBlock = page.locator(".editor-canvas .cms-image-block");
  const resize = page.getByRole("button", {
    name: "Resize image width",
    exact: true,
  });
  await resize.scrollIntoViewIfNeeded();
  const originalWidth = await imageBlock.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  const grip = await resize.boundingBox();
  expect(grip).not.toBeNull();
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip!.x + grip!.width / 2 - 60,
    grip!.y + grip!.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  const resizedWidth = await imageBlock.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(resizedWidth).toBeLessThan(originalWidth - 60);
  await page
    .getByRole("button", { name: "Undo block edit", exact: true })
    .click();
  expect(
    await imageBlock.evaluate(
      (element) => element.getBoundingClientRect().width,
    ),
  ).toBeCloseTo(originalWidth, 0);
  await page
    .getByRole("button", { name: "Redo block edit", exact: true })
    .click();
  await imageBlock.locator("img").click({ button: "right" });
  const contextMenu = page.getByRole("menu", { name: "Block actions" });
  await contextMenu
    .getByRole("menuitemradio", { name: "Align right", exact: true })
    .click();
  await expect(imageBlock).toHaveClass(/cms-image-align-right/);
  expect(
    await imageBlock.evaluate((element) => {
      const container = element
        .closest(".editor-image-container")!
        .getBoundingClientRect();
      return Math.abs(container.right - element.getBoundingClientRect().right);
    }),
  ).toBeLessThan(2);
  await resize.focus();
  await page.keyboard.press("Shift+F10");
  await expect(contextMenu).toBeVisible();
  await contextMenu
    .getByRole("menuitem", { name: "Flip horizontally", exact: true })
    .click();
  await resize.press("ArrowLeft");
  const finalWidth = Math.round(resizedWidth - 10);
  await expect(
    page.getByRole("spinbutton", { name: "Width in pixels", exact: true }),
  ).toHaveValue(String(finalWidth));
  await page
    .getByRole("button", { name: "Save draft", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed."),
  ).toBeVisible();
  const inserted = (await page.request
    .get(`/api/admin/cms/content/${home.id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  expect(inserted.draft.data.content.map((block) => block.type)).toEqual([
    "Hero",
    "Image",
    "RichText",
    "Cards",
    "CallToAction",
  ]);
  expect(inserted.draft.data.content[1].props).toMatchObject({
    assetId,
    aspectRatio: "landscape",
    widthPx: finalWidth,
    alignment: "right",
    flipHorizontal: true,
  });
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByText("Published. The website now shows this saved revision."),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Page settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.screenshot({
    path: ".local/cms-editor-mobile.png",
    fullPage: false,
    mask: [page.locator(".admin-account")],
  });
  const overflow = await page.evaluate(() => ({
    width: window.innerWidth,
    document: document.documentElement.scrollWidth,
    elements: Array.from(document.querySelectorAll("main *"))
      .filter(
        (element) => element.getBoundingClientRect().right > window.innerWidth,
      )
      .slice(0, 15)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        width: element.getBoundingClientRect().width,
      })),
  }));
  expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(
    overflow.width,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".cms-puck").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/cms-editor-desktop.png",
    fullPage: false,
    mask: [page.locator(".admin-account")],
  });
  await publicPage.goto("/pages/en/home");
  await expect(
    publicPage.getByRole("img", {
      name: "An image inserted between two blocks",
    }),
  ).toBeVisible();
  await publicPage.setViewportSize({ width: 390, height: 844 });
  expect(
    await publicPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await publicPage.screenshot({
    path: ".local/cms-public-mobile.png",
    fullPage: true,
  });

  // Basic blocks insert at the requested position; the slider is fully edited
  // through the same central picker and remains manual after publication.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".editor-canvas .cms-hero h1").click();
  await page
    .getByRole("button", { name: "Add block before Hero", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Heading block", exact: true })
    .click();
  await page
    .locator(".editor-canvas .cms-heading h2 [contenteditable]")
    .hover();
  await page
    .locator(".editor-canvas .cms-heading [contenteditable='plaintext-only']")
    .fill("Our club in pictures");
  await page
    .getByRole("textbox", { name: "Heading text", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Heading text", exact: true }),
  ).toHaveValue("Our club in pictures");
  await page.locator(".editor-canvas .cms-image-block img").click();
  await page
    .getByRole("button", { name: "Add block after Image", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Image slider block", exact: true })
    .click();
  for (const slide of [1, 2]) {
    await page.getByRole("button", { name: "Add slide", exact: true }).click();
    await page
      .getByRole("button", {
        name: `Choose image for slide ${slide}`,
        exact: true,
      })
      .click();
    await picker.getByRole("button", { name: /Synthetic club image/ }).click();
    await picker
      .getByRole("button", { name: "Insert image", exact: true })
      .click();
    await page
      .getByRole("textbox", {
        name: `Alternative text for slide ${slide}`,
        exact: true,
      })
      .fill(`Synthetic slide ${slide}`);
    await page
      .getByRole("textbox", { name: `Caption for slide ${slide}`, exact: true })
      .fill(`Community picture ${slide}`);
  }
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed."),
  ).toBeVisible();
  const withSlider = (await page.request
    .get(`/api/admin/cms/content/${home.id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  expect(withSlider.draft.data.content.map((block) => block.type)).toEqual([
    "Heading",
    "Hero",
    "Image",
    "ImageSlider",
    "RichText",
    "Cards",
    "CallToAction",
  ]);
  const sliderBlock = withSlider.draft.data.content.find(
    (block) => block.type === "ImageSlider",
  );
  expect(sliderBlock?.props.items.map((slide) => slide.assetId)).toEqual([
    assetId,
    assetId,
  ]);
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByText("Published. The website now shows this saved revision."),
  ).toBeVisible();
  await publicPage.goto("/pages/en/home");
  await expect(
    publicPage.getByRole("heading", {
      name: "Our club in pictures",
      exact: true,
    }),
  ).toBeVisible();
  const slider = publicPage.getByRole("region", {
    name: "Image slider",
    exact: true,
  });
  await expect(
    slider.getByText("Community picture 1", { exact: true }),
  ).toBeVisible();
  await slider.getByRole("button", { name: "Next image", exact: true }).click();
  await expect(
    slider.getByText("Community picture 2", { exact: true }),
  ).toBeVisible();
  await expect(slider.getByText("Image 2 of 2", { exact: true })).toBeVisible();
  await slider
    .getByRole("button", { name: "Previous image", exact: true })
    .click();
  await expect(
    slider.getByText("Community picture 1", { exact: true }),
  ).toBeVisible();
  await slider
    .getByRole("button", { name: "Show image 2", exact: true })
    .click();
  await expect(
    slider.getByText("Community picture 2", { exact: true }),
  ).toBeVisible();
  expect(
    await publicPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await appearanceJourney({ page, publicPage, homeId: home.id, origin });
  await siteEditorJourney({
    page,
    publicPage,
    homeId: home.id,
    assetId,
    origin,
  });
  await formsJourney({ page, publicPage, browser, cmsPageId: home.id, origin });
  await publicationJourney(page, publicPage, database, origin);
  await partnersJourney(page, publicPage, origin);
  await communityJourney(page, publicPage, origin, assetId);
  await clubFeaturesJourney(page, publicPage);
  // This accelerated journey spans several real editing sessions. Advance only
  // this synthetic owner's limiter window in the guarded disposable test DB.
  const kitOwner = await database.query<{ id: string }>(
    'SELECT id FROM club."user" WHERE email=$1',
    [ownerEmail],
  );
  const kitWriteKey = `app:cms-write:${createHash("sha256").update(kitOwner.rows[0].id).digest("hex")}`;
  await database.query(
    "UPDATE club.rate_limit SET last_request=$1 WHERE key=$2",
    [Date.now() - 61_000, kitWriteKey],
  );
  await kitJourney(page, publicPage, origin, assetId);
  await brandingJourney(page, publicPage, assetId);
  await eventDirectoryJourney(page, publicPage);
  await emailJourney(page, publicPage);
  await formEmailJourney(page, publicPage, origin);
  await calendarJourney(page, publicPage, browser, origin, home.id);
  await adminCollectionsJourney(page);
  await formStudioJourney(page, publicPage);
  await websitePublicationJourney(page, publicPage, origin);
  await anonymousContext.close();
});
