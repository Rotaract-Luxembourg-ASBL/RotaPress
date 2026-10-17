import { expect, type Page } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import type { AdminMediaAssetDto } from "../../src/features/media/media_schemas";

/** B02: a real uploaded video, public poster, saved inspector and native captions. */
export async function videoBlockJourney(
  page: Page,
  visitor: Page,
  video: AdminMediaAssetDto,
) {
  const origin = new URL(page.url()).origin;
  const post = async <T>(url: string, data: object) => {
    const response = await page.request.post(url, {
      headers: { origin },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as T;
  };
  await page.goto(`/admin/media?asset=${video.id}`);
  const details = page.getByRole("dialog", {
    name: "File details",
    exact: true,
  });
  await details
    .getByRole("combobox", { name: "Visibility", exact: true })
    .selectOption("public");
  await details
    .getByRole("button", { name: "Save file details", exact: true })
    .click();
  await expect(
    details.locator(".media-detail-actions").getByRole("status"),
  ).toHaveText("All changes saved.");
  await page.keyboard.press("Escape");
  const collection = await page.request.get(
    "/api/admin/media?visibility=public&kind=image&pageSize=1",
  );
  expect(collection.ok()).toBe(true);
  const poster = ((await collection.json()) as { assets: AdminMediaAssetDto[] })
    .assets[0];
  expect(poster?.kind).toBe("image");

  let content = await post<CmsDetail>("/api/admin/cms/content", {
    kind: "page",
    locale: "en",
    title: "Video accessibility browser",
    slug: "video-accessibility-browser",
    templateId: "blank",
  });
  const videoDocument = {
    root: { props: {} },
    content: [
      {
        type: "Video",
        props: {
          id: "accessible-video",
          version: 1,
          assetId: video.id,
          title: "Captioned club film",
          transcript: "A synthetic club film.",
          posterAssetId: poster.id,
          captionLanguage: "en",
          captionLabel: "English",
          captions: [{ start: 0, end: 2, text: "Welcome to the club" }],
        },
      },
    ],
  };
  const save = {
    locale: "en",
    expectedRevisionId: content.draft.id,
    title: content.draft.title,
    slug: content.draft.slug,
    description: "",
    socialImageId: null,
    data: videoDocument,
  };
  const invalid = await page.request.post(
    `/api/admin/cms/content/${content.id}/save`,
    {
      headers: { origin },
      data: {
        ...save,
        data: {
          ...videoDocument,
          content: [
            {
              ...videoDocument.content[0],
              props: {
                ...videoDocument.content[0].props,
                posterAssetId: video.id,
              },
            },
          ],
        },
      },
    },
  );
  expect(invalid.status()).toBe(422);
  content = await post<CmsDetail>(
    `/api/admin/cms/content/${content.id}/save`,
    save,
  );
  await page.goto(`/admin/website/${content.id}?locale=en`);
  const canvas = page.frameLocator(".editor-canvas iframe");
  await canvas.getByText("Captioned club film", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Caption menu label", exact: true })
    .fill("English captions");
  await expect(
    page.getByRole("textbox", { name: /^Caption language/ }),
  ).toHaveValue("en");
  const imageList = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/admin/media" &&
      url.searchParams.get("kind") === "image"
    );
  });
  await page
    .getByRole("button", { name: "Replace image", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Replace image",
    exact: true,
  });
  await expect(
    picker.getByRole("button", { name: "Replace image", exact: true }),
  ).toBeEnabled();
  const listed = await imageList;
  expect(listed.ok()).toBe(true);
  expect(
    ((await listed.json()) as { assets: AdminMediaAssetDto[] }).assets.every(
      (asset) => asset.kind === "image",
    ),
  ).toBe(true);
  await picker
    .getByRole("button", { name: "Replace image", exact: true })
    .click();
  await page.keyboard.press("Control+s");
  await expect(
    page.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  const saved = await page.request.get(
    `/api/admin/cms/content/${content.id}?locale=en`,
  );
  content = (await saved.json()) as CmsDetail;
  expect(content.draft.data.content[0]).toMatchObject({
    type: "Video",
    props: {
      assetId: video.id,
      posterAssetId: poster.id,
      captionLabel: "English captions",
      captions: videoDocument.content[0].props.captions,
    },
  });
  await post(`/api/admin/cms/content/${content.id}/publish`, {
    locale: "en",
    expectedRevisionId: content.draft.id,
  });

  await visitor.goto(`/pages/en/${content.draft.slug}`);
  const player = visitor.getByLabel("Captioned club film", { exact: true });
  await expect(player).toBeVisible();
  await expect(player).toHaveAttribute("poster", `/media/${poster.id}`);
  expect((await visitor.request.get(`/media/${poster.id}`)).status()).toBe(200);
  const track = player.locator("track");
  await expect
    .poll(() =>
      track.evaluate((element: HTMLTrackElement) => element.readyState),
    )
    .toBe(2);
  expect(
    await track.evaluate((element: HTMLTrackElement) => ({
      mode: element.track.mode,
      language: element.srclang,
      label: element.label,
      cues: Array.from(element.track.cues ?? []).map(
        (cue) => (cue as VTTCue).text,
      ),
    })),
  ).toEqual({
    mode: "showing",
    language: "en",
    label: "English captions",
    cues: ["Welcome to the club"],
  });
  await player.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true;
    await element.play();
  });
  await expect
    .poll(() =>
      player.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeGreaterThan(0);
  await player.evaluate((element: HTMLVideoElement) => element.pause());
  await expect(
    visitor.getByText("Read transcript", { exact: true }),
  ).toBeVisible();
  await visitor.setViewportSize({ width: 390, height: 844 });
  expect(
    await visitor.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await visitor.screenshot({
    path: ".local/video-captions-phone.png",
    fullPage: true,
  });
}
