import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cmsBlockSchema } from "../../src/features/cms/cms_schemas";
import {
  SiteBrandBlock,
  SitePartProvider,
} from "../../src/features/cms/ui/site-part-blocks";

const brandProps = {
  id: "club-identity",
  version: 1 as const,
  assetId: "",
  alt: "Uploaded club signature",
  label: "",
  showName: true,
  logoSize: "medium" as const,
};

describe("CMS template identity", () => {
  it("allows only bundled identities and preserves blocks without one", () => {
    expect(
      cmsBlockSchema.safeParse({ type: "SiteBrand", props: brandProps })
        .success,
    ).toBe(true);
    for (const templateBrand of ["rotary", "rotaract"]) {
      expect(
        cmsBlockSchema.safeParse({
          type: "SiteBrand",
          props: { ...brandProps, templateBrand },
        }).success,
      ).toBe(true);
    }
    expect(
      cmsBlockSchema.safeParse({
        type: "SiteBrand",
        props: {
          ...brandProps,
          templateBrand: "https://outside.example/logo.svg",
        },
      }).success,
    ).toBe(false);
  });

  it("identifies the club with a built-in mark and gives an uploaded logo precedence", () => {
    const render = (assetId: string) =>
      renderToStaticMarkup(
        createElement(SitePartProvider, {
          value: {
            clubName: "Example Community Club",
            site: {
              navigation: [],
              footerText: "",
              socialLinks: [],
              homeHref: "/en/community",
            },
          },
          children: createElement(SiteBrandBlock, {
            ...brandProps,
            showName: false,
            templateBrand: "rotaract",
            assetId,
          }),
        }),
      );
    const template = render("");
    expect(template).toContain("/templates/rotaract/masterbrand.png");
    expect(template).toContain('href="/en/community"');
    expect(template).toMatch(/<span\b[^>]*>Example Community Club<\/span>/);
    const assetId = randomUUID();
    const uploaded = render(assetId);
    expect(uploaded).toContain(`/media/${assetId}`);
    expect(uploaded).not.toContain("/templates/");
    expect(uploaded).not.toMatch(/<span\b[^>]*>Example Community Club<\/span>/);
  });
});
