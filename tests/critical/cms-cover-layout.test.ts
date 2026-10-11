import { randomUUID } from "node:crypto";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  cmsDataSchema,
  type CmsData,
  type PublicPage,
  type PublicSite,
} from "../../src/features/cms/cms_schemas";
import {
  contentAssets,
  validateContent,
} from "../../src/features/cms/cms_validation";
import { CoverBlock } from "../../src/features/cms/ui/basic-block-renderers";
import type { BlockProps } from "../../src/features/cms/ui/block-renderers";
import { CmsPublicPage } from "../../src/ui/cms-public-page";

// Isolate page-title behavior from asynchronous connected content and shared chrome.
vi.mock("@/features/cms/ui/public-content", async () => {
  const { createElement } = await import("react");
  const { CoverBlock } =
    await import("../../src/features/cms/ui/basic-block-renderers");
  return {
    RenderContent: ({ data }: { data: CmsData }) =>
      data.content.map((block) =>
        block.type === "Cover"
          ? createElement(CoverBlock, { ...block.props, key: block.props.id })
          : null,
      ),
  };
});
vi.mock("../../src/ui/public-site-shell", () => ({
  PublicSiteShell: ({ children }: { children: ReactNode }) => children,
}));

const legacyCover = (): BlockProps<"Cover"> => ({
  id: "page-cover",
  version: 1,
  title: "Our community",
  body: "A shared purpose.",
  buttonLabel: "Get involved",
  buttonHref: "/membership",
  assetId: randomUUID(),
  tone: "ink",
  padding: "large",
  alignment: "left",
});
const data = (props: BlockProps<"Cover">) =>
  cmsDataSchema.parse({
    root: { props: {} },
    content: [{ type: "Cover", props }],
  });
const site: PublicSite = {
  themeId: "default",
  accentColor: null,
  font: null,
  navigation: [],
  footerText: "",
  socialLinks: [],
  header: null,
  footer: null,
};
function pageMarkup(props: BlockProps<"Cover">, showTitle = true) {
  const page: PublicPage = {
    id: randomUUID(),
    kind: "page",
    title: "Page title",
    slug: "community",
    locale: "en",
    description: "",
    socialImageId: null,
    data: data(props),
    sections: {},
  };
  return renderToStaticMarkup(
    createElement(CmsPublicPage, { page, site, club: null, showTitle }),
  );
}

describe("native cover page banners", () => {
  it("preserves existing cover fields, heading role and automatic page title", () => {
    const props = legacyCover();
    const saved = data(props).content[0].props;
    expect(saved).not.toHaveProperty("presentation");
    expect(saved).not.toHaveProperty("imageOpacity");
    const markup = renderToStaticMarkup(createElement(CoverBlock, props));
    expect(markup).toContain("<h2>Our community</h2>");
    expect(markup).not.toContain("data-presentation=");
    expect(markup).not.toContain("--cms-cover-photo-opacity");
    expect(pageMarkup(props)).toContain(
      '<h1 class="cms-page-title">Page title</h1>',
    );
  });

  it("uses one page heading for an explicit banner and retains native image and button", () => {
    const props = {
      ...legacyCover(),
      presentation: "banner" as const,
      imageOpacity: 55,
      body: "",
    };
    const markup = pageMarkup(props);
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).toContain("<h1>Our community</h1>");
    expect(markup).not.toContain("cms-page-title");
    expect(markup).not.toContain("<p></p>");
    expect(markup).toContain('data-presentation="banner"');
    expect(markup).toContain("--cms-cover-photo-opacity:0.55");
    expect(markup).toContain(`/media/${props.assetId}`);
    expect(markup).toContain('href="/membership"');
  });

  it("keeps the page title when a banner has no heading and respects explicit title hiding", () => {
    const props = {
      ...legacyCover(),
      presentation: "banner" as const,
      title: "",
    };
    expect(pageMarkup(props).match(/<h1\b/g)).toHaveLength(1);
    expect(pageMarkup(props)).toContain("Page title");
    expect(pageMarkup(props, false)).not.toContain("<h1");
  });

  it("bounds native photo visibility and retains existing asset-reference validation", () => {
    const props = legacyCover();
    for (const imageOpacity of [0, 55, 100]) {
      const valid = validateContent(
        data({ ...props, presentation: "banner", imageOpacity }),
        "page",
      );
      expect(contentAssets(valid)).toEqual([props.assetId]);
    }
    for (const change of [
      { presentation: "absolute" },
      { imageOpacity: -1 },
      { imageOpacity: 101 },
      { imageOpacity: 0.5 },
      { assetId: "https://outside.example/photo.jpg" },
      { backgroundCss: "url(https://outside.example/photo.jpg)" },
    ])
      expect(() =>
        cmsDataSchema.parse({
          root: { props: {} },
          content: [{ type: "Cover", props: { ...props, ...change } }],
        }),
      ).toThrow();
  });
});
