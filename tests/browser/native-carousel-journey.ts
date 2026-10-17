import { expect, type Page } from "@playwright/test";
import type { CmsData, CmsDetail } from "../../src/features/cms/cms_schemas";
import { featureBackgroundProps } from "../fixtures/feature-background";

/** B02 uses its existing authorized owner and a synthetic public image. */
export async function nativeCarouselJourney(
  page: Page,
  visitor: Page,
  origin: string,
  assetId: string,
) {
  async function post(path: string, data: unknown): Promise<CmsDetail> {
    const response = await page.request.post(path, {
      headers: { origin },
      data,
    });
    expect(response.ok(), `${path}: ${response.status()}`).toBe(true);
    return response.json() as Promise<CmsDetail>;
  }
  const created = await post("/api/admin/cms/content", {
    kind: "page",
    locale: "en",
    title: "Native section acceptance",
    slug: "native-section-acceptance",
    templateId: "blank",
  });
  const items = Array.from({ length: 8 }, (_, index) => ({
    assetId,
    alt: `Synthetic photograph ${index + 1}`,
    caption: `Photo ${index + 1}`,
  }));
  const data: CmsData = {
    root: { props: {} },
    content: [
      {
        type: "HeroSlider",
        props: {
          id: "native-hero",
          version: 1,
          label: "Native featured stories",
          position: "left",
          items: [
            {
              title: "A native full-width story",
              body: "Synthetic content for the editor and public renderer.",
              assetId,
              alt: "Synthetic hero artwork",
              buttonLabel: "",
              buttonHref: "",
            },
            {
              title: "The next native story",
              body: "The carousel changes only after a manual action.",
              assetId,
              alt: "Synthetic second hero artwork",
              buttonLabel: "",
              buttonHref: "",
            },
          ],
        },
      },
      {
        type: "FeatureSection",
        props: { ...featureBackgroundProps(assetId), layout: "split" },
      },
      {
        type: "Cover",
        props: {
          id: "native-photo-banner",
          version: 1,
          title: "Synthetic photo banner",
          body: "Editable banner copy",
          buttonLabel: "",
          buttonHref: "",
          assetId,
          tone: "ink",
          padding: "large",
          alignment: "left",
        },
      },
      {
        type: "ImageSlider",
        props: {
          id: "native-photo-strip",
          version: 1,
          aspectRatio: "landscape",
          items,
        },
      },
    ],
  };
  const saved = await post(`/api/admin/cms/content/${created.id}/save`, {
    locale: "en",
    expectedRevisionId: created.draft.id,
    title: created.draft.title,
    slug: created.draft.slug,
    description: "Synthetic native section acceptance",
    socialImageId: null,
    data,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/admin/website/${saved.id}?locale=en`);
  const canvas = page.frameLocator(".editor-canvas iframe");
  const strip = canvas.locator(".cms-image-slider");
  await expect(strip.locator("figure:visible")).toHaveCount(1);
  await canvas.locator(".cms-hero-slider h1").click();
  await page
    .getByRole("combobox", { name: "Hero height", exact: true })
    .selectOption({ label: "Tall" });
  await page
    .getByRole("combobox", { name: "Text presentation", exact: true })
    .selectOption({ label: "Over the photograph" });
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Content width", exact: true })
    .selectOption("viewport");
  await canvas.locator(".cms-feature-section h2").click();
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  await page.getByText("Behind story and benefits", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Behind story and benefits", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Replace image", exact: true }),
  ).toBeVisible();
  await expect(canvas.locator(".cms-feature-section")).toHaveClass(
    /cms-feature-background/,
  );
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Content width", exact: true })
    .selectOption("viewport");
  await canvas
    .getByRole("heading", {
      name: "Synthetic photo banner",
      exact: true,
    })
    .click();
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  await page.getByText("Page banner", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Page banner", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("spinbutton", {
      name: "Photo visibility (%)",
      exact: true,
    })
    .fill("55");
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Content width", exact: true })
    .selectOption("viewport");
  await page
    .getByRole("combobox", { name: "Section corners", exact: true })
    .selectOption("square");
  await strip.locator("figure").first().click();
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  await page
    .getByRole("combobox", {
      name: "Photos on desktop (one on phone)",
      exact: true,
    })
    .selectOption({ label: "Four photos" });
  await expect(strip.locator("figure:visible")).toHaveCount(4);
  await page
    .getByRole("combobox", {
      name: "Photos on desktop (one on phone)",
      exact: true,
    })
    .selectOption({ label: "Three photos" });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  const reloaded = (await page.request
    .get(`/api/admin/cms/content/${saved.id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  const hero = reloaded.draft.data.content.find(
    (block) => block.type === "HeroSlider",
  );
  expect(hero?.props).toMatchObject({
    height: "tall",
    presentation: "overlay",
    design: { width: "viewport" },
  });
  const feature = reloaded.draft.data.content.find(
    (block) => block.type === "FeatureSection",
  );
  expect(feature?.props).toMatchObject({
    layout: "background",
    design: { width: "viewport" },
  });
  expect(
    reloaded.draft.data.content.find((block) => block.type === "Cover")?.props,
  ).toMatchObject({
    presentation: "banner",
    imageOpacity: 55,
    design: { width: "viewport", corners: "square" },
  });
  const slider = reloaded.draft.data.content.find(
    (block) => block.type === "ImageSlider",
  );
  expect(slider?.props).toMatchObject({ visibleImages: "three", items });
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await expect(strip.locator("figure:visible")).toHaveCount(3);
  async function canvasBounds() {
    for (const section of [".cms-hero-slider", ".cms-feature-section"]) {
      const bounds = await canvas.locator(section).evaluate((node) => {
        const frame = node.closest(".cms-design")!.getBoundingClientRect();
        const root = node.ownerDocument.documentElement.getBoundingClientRect();
        return {
          left: frame.left - root.left,
          right: root.right - frame.right,
          widthDifference: root.width - frame.width,
        };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(-1);
      expect(bounds.right).toBeGreaterThanOrEqual(-1);
      expect(Math.abs(bounds.widthDifference)).toBeLessThanOrEqual(3);
    }
  }
  await canvasBounds();
  await page
    .getByRole("button", { name: "Mobile canvas width", exact: true })
    .click();
  await expect(strip.locator("figure:visible")).toHaveCount(1);
  await canvasBounds();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await visitor.request.get(`/pages/en/${saved.draft.slug}`)).status(),
  ).toBe(404);
  const preview = await page.context().newPage();
  await preview.setViewportSize({ width: 1440, height: 1000 });
  await preview.goto(`/admin/website/${saved.id}/preview?locale=en`);
  await expect(
    preview.locator(".cms-hero-slider[data-height='tall']"),
  ).toBeVisible();
  const publicStrip = preview.locator(".cms-image-slider");
  await expect(publicStrip.locator("figure:visible")).toHaveCount(3);
  const next = publicStrip.getByRole("button", {
    name: "Next image",
    exact: true,
  });
  await next.focus();
  await preview.keyboard.press("Enter");
  await expect(next).toBeFocused();
  await expect(publicStrip.locator("figure:visible").first()).toHaveAttribute(
    "aria-label",
    "2 of 8",
  );
  await publicStrip
    .getByRole("button", { name: "Show image 8", exact: true })
    .click();
  await expect(publicStrip.locator("figure:visible")).toHaveText([
    "Photo 8",
    "Photo 1",
    "Photo 2",
  ]);
  await publicStrip
    .getByRole("button", { name: "Next image", exact: true })
    .click();
  await expect(publicStrip.locator("figure:visible")).toHaveText([
    "Photo 1",
    "Photo 2",
    "Photo 3",
  ]);
  await preview
    .getByRole("button", { name: "Next featured story", exact: true })
    .focus();
  await preview.keyboard.press("Space");
  await expect(
    preview.getByRole("heading", {
      name: "The next native story",
      exact: true,
    }),
  ).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await preview.setViewportSize({ width, height: 1000 });
    await expect(publicStrip.locator("figure:visible")).toHaveCount(
      width > 700 ? 3 : 1,
    );
    const frame = await preview
      .locator("main .cms-design")
      .first()
      .boundingBox();
    const site = await preview.locator(".public-site").boundingBox();
    expect(Math.abs(frame!.width - site!.width)).toBeLessThanOrEqual(2);
    expect(frame!.x).toBeGreaterThanOrEqual(site!.x - 1);
    const coverGeometry = await preview
      .locator(".cms-cover")
      .evaluate((node) => ({
        height: node.getBoundingClientRect().height,
        corners: getComputedStyle(node).borderRadius,
        photoVisibility: getComputedStyle(node.querySelector(".cms-image")!)
          .opacity,
      }));
    expect(coverGeometry.height).toBeGreaterThanOrEqual(287);
    expect(coverGeometry.corners).toBe("0px");
    expect(coverGeometry.photoVisibility).toBe("0.55");
    const leadingGap = await preview
      .locator("main > .cms-design")
      .first()
      .evaluate(
        (node) =>
          node.getBoundingClientRect().top -
          node.parentElement!.getBoundingClientRect().top,
      );
    expect(Math.abs(leadingGap)).toBeLessThanOrEqual(1);
    expect(
      await preview.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const heroHeight = await preview
      .locator(".cms-hero-slide")
      .evaluate((node) => node.getBoundingClientRect().height);
    const expectedHeight = Math.max(600, Math.min(900, site!.width * 0.625));
    expect(heroHeight).toBeGreaterThanOrEqual(expectedHeight - 1);
    await preview.screenshot({
      path: `.local/native-sections-preview-${width}.png`,
      fullPage: true,
    });
  }
  await preview.close();
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByText("Published. The website now shows this saved revision.", {
      exact: true,
    }),
  ).toBeVisible();
  await visitor.setViewportSize({ width: 1440, height: 1000 });
  await visitor.goto(`/pages/en/${saved.draft.slug}`);
  await expect(visitor.locator(".cms-feature-background")).toBeVisible();
  await expect(visitor.locator(".cms-cover h1")).toHaveText(
    "Synthetic photo banner",
  );
  await expect(visitor.locator(".cms-image-slider figure:visible")).toHaveCount(
    3,
  );
}
