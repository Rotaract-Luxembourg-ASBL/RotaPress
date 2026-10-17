import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  cmsBlockSchema,
  type CmsData,
} from "../../src/features/cms/cms_schemas";
import { contentAssets } from "../../src/features/cms/cms_validation";
import { contentAssetKinds } from "../../src/features/cms/cms_asset_kinds";
import { VideoBlock } from "../../src/features/cms/ui/file-blocks";
import {
  captionLanguageSchema,
  videoCaptionCuesSchema,
  videoCaptionsVtt,
} from "../../src/features/cms/video_captions";

const videoId = "00000000-0000-4000-8000-000000000001";
const posterId = "00000000-0000-4000-8000-000000000002";
const props = {
  id: "video",
  version: 1 as const,
  assetId: videoId,
  title: "Club film",
  transcript: "A member speaks.",
};

describe("video posters and timed captions", () => {
  it("keeps existing Video snapshots unchanged and rejects non-media poster identities", () => {
    expect(cmsBlockSchema.parse({ type: "Video", props })).toEqual({
      type: "Video",
      props,
    });
    expect(
      cmsBlockSchema.safeParse({
        type: "Video",
        props: { ...props, posterAssetId: "https://example.org/poster.jpg" },
      }).success,
    ).toBe(false);
    expect(captionLanguageSchema.parse("fr-LU")).toBe("fr-LU");
    expect(captionLanguageSchema.safeParse("invalid language").success).toBe(
      false,
    );
  });

  it("requires bounded ordered intervals with usable millisecond precision", () => {
    const valid = [
      { start: 0, end: 1.5, text: "First" },
      { start: 1.5, end: 3, text: "Second" },
    ];
    expect(videoCaptionCuesSchema.parse(valid)).toEqual(valid);
    for (const cue of [
      { start: -1, end: 1 },
      { start: 2, end: 2 },
      { start: 2, end: 1 },
      { start: 1, end: 1.0001 },
      { start: 0, end: Number.POSITIVE_INFINITY },
      { start: 0, end: 86_401 },
    ])
      expect(
        videoCaptionCuesSchema.safeParse([{ ...cue, text: "Caption" }]).success,
      ).toBe(false);
    expect(videoCaptionCuesSchema.safeParse([valid[1], valid[0]]).success).toBe(
      false,
    );
    expect(
      videoCaptionCuesSchema.safeParse([
        valid[0],
        { start: 1, end: 3, text: "Overlap" },
      ]).success,
    ).toBe(false);
    expect(
      videoCaptionCuesSchema.safeParse([{ start: 0, end: 1, text: " " }])
        .success,
    ).toBe(false);
    expect(
      videoCaptionCuesSchema.safeParse(
        Array.from({ length: 501 }, (_, start) => ({
          start,
          end: start + 1,
          text: "Cue",
        })),
      ).success,
    ).toBe(false);
    expect(
      videoCaptionCuesSchema.safeParse(
        Array.from({ length: 26 }, (_, start) => ({
          start,
          end: start + 1,
          text: "x".repeat(2_000),
        })),
      ).success,
    ).toBe(false);
  });

  it("serializes plain text without permitting cue markup or timestamp injection", () => {
    const vtt = videoCaptionsVtt([
      {
        start: 62.5,
        end: 63.001,
        text: "<b>Speaker</b> & guest\r\n\r\n00:00:00.000 --> 00:00:01.000\r\n<00:00:00.500>",
      },
    ]);
    expect(vtt).toBe(
      "WEBVTT\n\n1\n00:01:02.500 --> 00:01:03.001\n&lt;b&gt;Speaker&lt;/b&gt; &amp; guest\n00:00:00.000 --&gt; 00:00:01.000\n&lt;00:00:00.500&gt;\n",
    );
    expect(videoCaptionsVtt([])).toBeNull();
    expect(
      videoCaptionsVtt([{ start: 2, end: 1, text: "Incomplete edit" }]),
    ).toBeNull();
  });

  it("includes nested posters in publication, ownership, kind and deletion references", () => {
    const data: CmsData = {
      root: { props: {} },
      content: [
        {
          type: "Columns",
          props: {
            id: "layout",
            version: 1,
            ratio: "balanced",
            right: [],
            left: [
              { type: "Video", props: { ...props, posterAssetId: posterId } },
            ],
          },
        },
      ],
    };
    expect(contentAssets(data).sort()).toEqual([videoId, posterId].sort());
    expect(contentAssetKinds(data)).toEqual([
      { id: posterId, kind: "image" },
      { id: videoId, kind: "video" },
    ]);
  });

  it("uses the poster and native caption track in the public/editor player", () => {
    const html = renderToStaticMarkup(
      createElement(VideoBlock, {
        ...props,
        posterAssetId: posterId,
        captionLanguage: "fr",
        captionLabel: "Français",
        captions: [{ start: 0, end: 2, text: "Bienvenue" }],
      }),
    );
    expect(html).toContain(`poster="/media/${posterId}"`);
    expect(html).toContain(`src="/media/${videoId}"`);
    expect(html).toContain('kind="captions"');
    expect(html).toContain('srcLang="fr"');
    expect(html).toContain('label="Français"');
    expect(html).toContain('controls=""');
    expect(html).toContain("Read transcript");
    const oldHtml = renderToStaticMarkup(createElement(VideoBlock, props));
    expect(oldHtml).not.toContain("<track");
    expect(oldHtml).not.toContain("poster=");
  });
});
