import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  cmsBlockSchema,
  defaultSiteSettings,
} from "../../src/features/cms/cms_schemas";
import { customCodeDocument } from "../../src/features/cms/custom_code";
import { CustomCodeBlock } from "../../src/features/cms/ui/custom-code-block";
import { clubPageTitle } from "../../src/features/cms/page_title";
import { publicMetadata } from "../../src/features/cms/public_metadata";
import { clubProfileSchema } from "../../src/core/organization/club_profile";
import { google } from "better-auth/social-providers";

describe("Club identity, metadata and isolated custom content", () => {
  it("keeps browser, search and social titles consistent without double suffixes", () => {
    expect(clubPageTitle("Home", "Example Club")).toBe("Home | Example Club");
    expect(clubPageTitle("About · Example Club", "Example Club")).toBe(
      "About | Example Club",
    );
    expect(clubPageTitle("Example Club", "Example Club")).toBe("Example Club");
    const metadata = publicMetadata({
      title: "Home",
      clubName: "Example Club",
      description: "Published",
      canonical: "https://example.test",
      origin: "https://example.test",
      site: {
        ...defaultSiteSettings,
        navigation: [],
        header: null,
        footer: null,
      },
    });
    expect(metadata.title).toEqual({ absolute: "Home | Example Club" });
    expect(metadata.openGraph).toMatchObject({
      title: "Home | Example Club",
      siteName: "Example Club",
    });
    expect(metadata.twitter).toMatchObject({ title: "Home | Example Club" });
  });
  it("validates optional public details and rejects executable or credential-bearing links", () => {
    expect(clubProfileSchema.parse({}).city).toBe("");
    for (const polarisUrl of [
      "javascript:alert(1)",
      "https://user:secret@example.test",
      "//example.test",
    ])
      expect(clubProfileSchema.safeParse({ polarisUrl }).success).toBe(false);
    expect(
      clubProfileSchema.safeParse({ charterDate: "2025-02-30" }).success,
    ).toBe(false);
    expect(
      cmsBlockSchema.safeParse({
        type: "ClubDetails",
        props: {
          id: "details",
          version: 1,
          title: "Club",
          fields: [{ field: "staffAuthPolicy" }],
          showLabels: true,
          layout: "list",
        },
      }).success,
    ).toBe(false);
  });
  it("retains executable code only inside a frame without same-origin or navigation permissions", () => {
    const props = {
      id: "code",
      version: 1 as const,
      title: "Widget",
      html: "<button>Count</button>",
      css: "body{color:red}",
      javascript: "window.count=1",
      height: 200,
    };
    const markup = renderToStaticMarkup(createElement(CustomCodeBlock, props));
    expect(markup).toContain('sandbox="allow-scripts"');
    expect(markup).not.toContain("allow-same-origin");
    expect(markup).not.toContain("allow-top-navigation");
    const source = customCodeDocument(
      props.html,
      "</style><iframe>",
      "</script><script>alert(1)</script>",
    );
    expect(source).toContain("connect-src 'none'");
    expect(source).toContain("form-action 'none'");
    expect(source).toContain("<\\/script>");
    expect(
      cmsBlockSchema.safeParse({
        type: "CustomCode",
        props: { ...props, html: "x".repeat(30001) },
      }).success,
    ).toBe(false);
  });
  it("uses Better Auth's verified hosted-domain guard, including rejection of consumer accounts", async () => {
    const provider = google({
      clientId: "synthetic.apps.googleusercontent.com",
      clientSecret: "synthetic-not-a-secret",
      hd: "example.test",
    });
    expect(provider.idToken.verifyClaims?.({ hd: "example.test" })).toBe(true);
    for (const claims of [
      {},
      { hd: "gmail.com" },
      { hd: "example.test.evil.test" },
    ])
      expect(provider.idToken.verifyClaims?.(claims)).toBe(false);
    const url = await provider.createAuthorizationURL({
      state: "synthetic",
      codeVerifier: "synthetic-verifier",
      redirectURI: "https://example.test/api/auth/callback/google",
    });
    expect(url.searchParams.get("hd")).toBe("example.test");
  });
});
