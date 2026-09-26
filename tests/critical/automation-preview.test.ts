import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { DomainError } from "@/core/DomainError";
import {
  defaultSiteSettings,
  type CmsDetail,
  type PublicPage,
} from "@/features/cms/cms_schemas";
import type { AutomationPrincipal } from "@/integrations/automation/AutomationAccess";
import {
  claimPreviewRenderer,
  issuePreviewDocument,
  takePreviewDocument,
  type PreviewDocument,
} from "@/integrations/automation/preview_snapshot";
import {
  previewOrigin,
  readPreviewStatic,
} from "@/integrations/automation/preview_assets";
import {
  PreviewBrowser,
  previewBrowserEnvironment,
} from "@/integrations/automation/preview_browser";
import { WebsitePreviewService } from "@/integrations/automation/WebsitePreviewService";
import { previewInput } from "@/integrations/automation/preview_schemas";

const id = "10000000-0000-4000-8000-000000000001";
const assetId = "10000000-0000-4000-8000-000000000002";
const changedId = "10000000-0000-4000-8000-000000000003";
const principal: AutomationPrincipal = {
  keyId: "fixture-key",
  organizationId: "fixture-club",
  scopes: ["website:read", "website:preview", "media:inspect"],
  sourceOrigins: [],
  actor: {
    userId: "fixture-owner",
    sessionId: "fixture-session",
    email: "owner@example.invalid",
    emailVerified: true,
    authMethod: "email-otp",
    authenticatedAt: new Date(),
  },
};
const page: PublicPage = {
  id,
  revisionId: id,
  kind: "page",
  locale: "en",
  title: "Preview fixture",
  slug: "preview-fixture",
  description: "",
  socialImageId: null,
  sections: {},
  data: {
    root: { props: {} },
    content: [
      {
        type: "Image",
        props: {
          id: "fixture-image",
          version: 1,
          assetId,
          alt: "Private synthetic image",
          caption: "",
        },
      },
    ],
  },
};
const document: PreviewDocument = {
  page,
  site: { ...defaultSiteSettings, navigation: [], header: null, footer: null },
  club: null,
  event: null,
};
const input = previewInput.parse({ id, expectedRevisionId: id });
const result = {
  width: 1440,
  height: 1000,
  offsetY: 0,
  pageHeight: 1000,
  nextOffsetY: null,
  layoutOverflow: false,
  image: { mimeType: "image/webp" as const, data: "fixture" },
  warnings: [],
};

function setup() {
  const detail: CmsDetail = {
    id,
    kind: "page",
    locale: "en",
    draft: { ...page, id, createdAt: new Date().toISOString() },
    publishedRevisionId: null,
    archived: false,
    revisions: [],
    affectedPages: [],
  };
  const services = {
    authorization: {
      require: vi
        .fn()
        .mockResolvedValue({ organizationId: principal.organizationId }),
    },
    limiter: { consume: vi.fn().mockResolvedValue(undefined) },
    cms: {
      detail: vi.fn().mockResolvedValue(detail),
      preview: vi.fn().mockResolvedValue(page),
      publicSite: vi.fn().mockResolvedValue(document.site),
    },
    events: { detail: vi.fn() },
    organization: { publicIdentity: vi.fn().mockResolvedValue(null) },
    media: {
      read: vi.fn(async (actor: typeof principal.actor | null) => {
        if (!actor)
          throw new DomainError("MEDIA_NOT_FOUND", "Unavailable", 404);
        return {
          bytes: Buffer.from("private fixture"),
          mimeType: "image/webp" as const,
          visibility: "private" as const,
        };
      }),
    },
  };
  const browser = {
    capture: vi.fn(
      async (request: Parameters<PreviewBrowser["capture"]>[0]) => {
        await request.asset(assetId);
        return result;
      },
    ),
  };
  const fetcher = vi.fn(async (_origin: string, token: string) => {
    expect(
      takePreviewDocument(new Headers({ authorization: `Bearer ${token}` })),
    ).not.toBeNull();
    return Buffer.from("rendered fixture");
  });
  const reauthorize = vi.fn().mockResolvedValue(principal);
  return {
    services,
    browser,
    fetcher,
    reauthorize,
    service: new WebsitePreviewService(services, browser, fetcher),
  };
}

describe("C14 private visual review", () => {
  it("does not inherit application credentials or runtime injection options in Chromium", () => {
    expect(
      previewBrowserEnvironment({
        NODE_ENV: "test",
        PATH: "/usr/bin",
        TEMP: "/tmp",
        SystemRoot: "C:/Windows",
        DATABASE_URL: "synthetic-database-credential",
        BETTER_AUTH_SECRET: "synthetic-auth-key",
        RESEND_API_KEY: "synthetic-provider-key",
        LD_PRELOAD: "untrusted-library",
        NODE_OPTIONS: "--inspect",
      }),
    ).toEqual({
      LANG: "en_US.UTF-8",
      PATH: "/usr/bin",
      TEMP: "/tmp",
      SystemRoot: "C:/Windows",
    });
  });
  it("uses expiring one-use capabilities, not cookies or public preview links", () => {
    const ticket = issuePreviewDocument(document, 1000);
    expect(
      takePreviewDocument(new Headers({ cookie: "session=fixture" }), 1001),
    ).toBeNull();
    expect(
      takePreviewDocument(
        new Headers({ authorization: "Bearer rp_unrelated_key" }),
        1001,
      ),
    ).toBeNull();
    const headers = new Headers({ authorization: `Bearer ${ticket.token}` });
    expect(takePreviewDocument(headers, 1001)).toBe(document);
    expect(takePreviewDocument(headers, 1002)).toBeNull();
    const expired = issuePreviewDocument(document, 1000);
    expect(
      takePreviewDocument(
        new Headers({ authorization: `Bearer ${expired.token}` }),
        31000,
      ),
    ).toBeNull();
    const release = claimPreviewRenderer();
    expect(() => claimPreviewRenderer()).toThrow("Another visual preview");
    release();
  });

  it("rejects stale revisions before launching Chromium and requires both grants", async () => {
    const fixture = setup();
    await expect(
      fixture.service.capture(
        principal,
        { ...input, expectedRevisionId: changedId },
        fixture.reauthorize,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(fixture.browser.capture).not.toHaveBeenCalled();
    await expect(
      fixture.service.capture(
        { ...principal, scopes: ["website:preview"] },
        input,
        fixture.reauthorize,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("does not expose private images without a separate media inspection grant", async () => {
    const fixture = setup();
    const limited = {
      ...principal,
      scopes: principal.scopes.filter((scope) => scope !== "media:inspect"),
    };
    fixture.reauthorize.mockResolvedValue(limited);
    const preview = await fixture.service.capture(
      limited,
      input,
      fixture.reauthorize,
    );
    expect(fixture.services.media.read).toHaveBeenCalledWith(null, assetId);
    expect(
      preview.warnings.some((warning) => warning.includes("media:inspect")),
    ).toBe(true);
    expect(preview.reviewUrl).not.toContain("rp_preview_");
  });

  it("does not use private media permission for images outside the saved snapshot", async () => {
    const fixture = setup();
    fixture.browser.capture.mockImplementationOnce(async (request) => {
      expect(await request.asset(changedId)).toBeNull();
      return result;
    });
    await fixture.service.capture(principal, input, fixture.reauthorize);
    expect(fixture.services.media.read).toHaveBeenCalledWith(null, changedId);
  });

  it("rechecks current connection, private-media grants and saved revision before returning pixels", async () => {
    const fixture = setup();
    fixture.reauthorize.mockRejectedValueOnce(
      new DomainError("AUTOMATION_AUTH_REQUIRED", "Expired", 401),
    );
    await expect(
      fixture.service.capture(principal, input, fixture.reauthorize),
    ).rejects.toMatchObject({ status: 401 });
    fixture.reauthorize.mockResolvedValueOnce({
      ...principal,
      scopes: ["website:read", "website:preview"],
    });
    await expect(
      fixture.service.capture(principal, input, fixture.reauthorize),
    ).rejects.toMatchObject({ status: 403 });
    fixture.reauthorize.mockResolvedValue(principal);
    const detail = await fixture.services.cms.detail();
    fixture.services.cms.detail
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce({
        ...detail,
        draft: { ...detail.draft, id: changedId },
      });
    await expect(
      fixture.service.capture(principal, input, fixture.reauthorize),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("restricts filesystem assets and instance-local origins", async () => {
    expect(previewOrigin("4101")).toBe("http://127.0.0.1:4101");
    for (const invalid of [
      "https://example.org",
      "0",
      "65536",
      "80@evil",
      "../.env",
    ])
      expect(() => previewOrigin(invalid)).toThrow();
    const directory = await mkdtemp(join(tmpdir(), "rotapress-preview-"));
    try {
      await mkdir(join(directory, ".next/static"), { recursive: true });
      await writeFile(
        join(directory, ".next/static/fixture.css"),
        "body{color:green}",
      );
      expect(
        (await readPreviewStatic("/_next/static/fixture.css", directory))
          ?.mimeType,
      ).toBe("text/css");
      for (const path of [
        "/.env",
        "/_next/static/../fixture.css",
        "/_next/static/app.js",
        "/_next/static/app.js.map",
        "/templates/BRAND_ASSETS.md",
        "/media/private",
        "/brand/%2e%2e/secret.svg",
        "/brand/..\\secret.svg",
      ])
        expect(await readPreviewStatic(path, directory)).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("captures bounded real pixels with JavaScript and arbitrary network requests blocked", async () => {
    let contacted = 0;
    const server = createServer((_request, response) => {
      contacted += 1;
      response.end("unexpected");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No loopback fixture port");
    try {
      const html = `<!doctype html><html><head><style>body{margin:0;background:#00ff00;min-height:3500px}</style></head><body><main data-automation-preview-revision="${id}">Synthetic visual review</main><script>document.body.style.background='red';fetch('http://127.0.0.1:${address.port}/script')</script><img src="http://127.0.0.1:${address.port}/image"><iframe src="http://127.0.0.1:${address.port}/frame"></iframe></body></html>`;
      const captured = await new PreviewBrowser().capture({
        origin: "http://127.0.0.1:3001",
        document: Buffer.from(html),
        input: { ...input, device: "phone" },
        asset: async () => null,
      });
      expect(captured).toMatchObject({
        width: 390,
        height: 2400,
        nextOffsetY: 2400,
        layoutOverflow: false,
      });
      const bytes = Buffer.from(captured.image.data, "base64");
      expect(bytes.length).toBeLessThanOrEqual(600 * 1024);
      expect(await sharp(bytes).metadata()).toMatchObject({
        format: "webp",
        width: 390,
        height: 2400,
      });
      const pixel = await sharp(bytes)
        .extract({ left: 200, top: 700, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer();
      expect(pixel[1]).toBeGreaterThan(240);
      expect(pixel[0]).toBeLessThan(15);
      expect(contacted).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
