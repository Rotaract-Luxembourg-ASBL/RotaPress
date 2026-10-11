import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cmsDataSchema } from "../../src/features/cms/cms_schemas";
import {
  contentAssets,
  validateContent,
} from "../../src/features/cms/cms_validation";
import { FeatureSectionBlock } from "../../src/features/cms/ui/section-renderers";
import { featureBackgroundProps } from "../fixtures/feature-background";

describe("native background feature sections", () => {
  it("keeps saved split sections readable without a new layout field", () => {
    const props = featureBackgroundProps(randomUUID());
    delete props.layout;
    const data = cmsDataSchema.parse({
      root: { props: {} },
      content: [{ type: "FeatureSection", props }],
    });
    expect(data.content[0].props).not.toHaveProperty("layout");
    expect(
      renderToStaticMarkup(createElement(FeatureSectionBlock, props)),
    ).toBe(
      renderToStaticMarkup(
        createElement(FeatureSectionBlock, { ...props, layout: "split" }),
      ),
    );
  });

  it("keeps background media in the existing publication-reference boundary", () => {
    const assetId = randomUUID();
    const props = featureBackgroundProps(assetId);
    const data = validateContent(
      {
        root: { props: {} },
        content: [{ type: "FeatureSection", props }],
      },
      "page",
    );
    expect(contentAssets(data)).toEqual([assetId]);
    for (const change of [
      { layout: "absolute" },
      { assetId: "https://outside.example/photo.jpg" },
      { backgroundCss: "url(https://outside.example/photo.jpg)" },
    ]) {
      expect(() =>
        validateContent(
          {
            root: { props: {} },
            content: [
              { type: "FeatureSection", props: { ...props, ...change } },
            ],
          },
          "page",
        ),
      ).toThrow();
    }
  });

  it("renders the editable story before separate benefit tiles and preserves its button", () => {
    const props = featureBackgroundProps(randomUUID());
    const markup = renderToStaticMarkup(
      createElement(FeatureSectionBlock, props),
    );
    expect(markup).toContain("cms-feature-background");
    expect(markup).toContain(`/media/${props.assetId}`);
    expect(markup).toContain(`alt="${props.alt}"`);
    expect(markup).toContain("<h2>Find your place in the community</h2>");
    expect(markup).toContain('href="/membership"');
    expect(markup.indexOf("Join the community")).toBeLessThan(
      markup.indexOf('<ul class="cms-feature-list">'),
    );
    for (const item of props.items)
      expect(markup).toContain(`<h3>${item.title}</h3>`);
    expect(markup.match(/class="cms-feature-icon"/g)).toHaveLength(4);
  });

  it("omits empty headings and empty background tiles without losing list-only content", () => {
    for (const layout of ["split", "background"] as const) {
      const props = {
        ...featureBackgroundProps(""),
        layout,
        title: "",
        body: "",
        eyebrow: "",
      };
      const markup = renderToStaticMarkup(
        createElement(FeatureSectionBlock, props),
      );
      expect(markup).not.toContain("<h2");
      expect(markup).toContain("Develop leadership");
    }
    const empty = renderToStaticMarkup(
      createElement(FeatureSectionBlock, {
        ...featureBackgroundProps(""),
        items: [],
      }),
    );
    expect(empty).toContain("cms-feature-background-story-only");
    expect(empty).not.toContain("<ul");
  });
});
