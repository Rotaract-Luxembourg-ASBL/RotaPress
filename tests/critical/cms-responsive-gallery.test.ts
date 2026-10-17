import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  blockDesignSchema,
  inheritedDesignValue,
} from "../../src/features/cms/block_design";
import { cmsBlockSchema } from "../../src/features/cms/cms_schemas";
import { albumDataSchema } from "../../src/features/media/album_schemas";
import { GalleryPresentation } from "../../src/features/cms/ui/gallery-presentation";
import { DesignFrame } from "../../src/features/cms/ui/design-frame";

const asset = "00000000-0000-4000-8000-000000000001";
describe("responsive design and reusable gallery contracts", () => {
  it("keeps old designs unchanged and resolves phone inheritance through tablet", () => {
    expect(blockDesignSchema.parse({ spacing: "compact" })).toEqual({
      spacing: "compact",
    });
    const design = blockDesignSchema.parse({
      textSize: "large",
      imageFit: "contain",
      responsive: {
        tablet: { textSize: "regular" },
        mobile: { imageRatio: "square", imagePosition: "top" },
      },
    });
    expect(inheritedDesignValue(design, "mobile", "textSize")).toEqual({
      value: "regular",
      source: "Tablet",
    });
    expect(inheritedDesignValue(design, "tablet", "imageFit")).toEqual({
      value: "contain",
      source: "All screens",
    });
    const html = renderToStaticMarkup(
      createElement(DesignFrame, { design, children: "Content" }),
    );
    expect(html).toContain('data-text-size="large"');
    expect(html).toContain('data-tablet-text-size="regular"');
    expect(html).toContain('data-mobile-image-position="top"');
    expect(html).not.toContain("data-mobile-text-size");
    expect(
      blockDesignSchema.safeParse({
        responsive: { mobile: { textSize: "99999px" } },
      }).success,
    ).toBe(false);
  });
  it("retains focal points and slider layout in linked album and independent block contracts", () => {
    const album = albumDataSchema.parse({
      title: "Portraits",
      layout: "slider",
      items: [
        {
          assetId: asset,
          alt: "First portrait",
          caption: "First",
          focalX: 20,
          focalY: 35,
        },
        {
          assetId: "00000000-0000-4000-8000-000000000002",
          alt: "Second",
          caption: "Second",
        },
      ],
    });
    const block = cmsBlockSchema.parse({
      type: "Gallery",
      props: {
        id: "album-copy",
        version: 1,
        items: album.items,
        layout: album.layout,
      },
    });
    expect(block.type === "Gallery" && block.props.items[0].focalX).toBe(20);
    expect(
      albumDataSchema.safeParse({
        ...album,
        items: [{ ...album.items[0], focalY: 101 }],
      }).success,
    ).toBe(false);
    const html = renderToStaticMarkup(
      createElement(GalleryPresentation, album),
    );
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain("object-position:20% 35%");
    expect(html).toContain('aria-label="Next photograph"');
    expect(html.match(/<figure/g)).toHaveLength(1);
  });
});
