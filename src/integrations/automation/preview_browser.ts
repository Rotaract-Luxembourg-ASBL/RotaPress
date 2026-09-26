import "server-only";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { DomainError } from "@/core/DomainError";
import type { PreviewInput } from "./preview_schemas";
import { previewDocumentPath } from "./preview_snapshot";
import { readPreviewStatic, type PreviewAsset } from "./preview_assets";

type CaptureInput = {
  origin: string;
  document: Buffer;
  input: PreviewInput;
  asset: (id: string) => Promise<PreviewAsset | null>;
};

/** Chromium needs OS paths, never the application's database/provider secrets. */
export function previewBrowserEnvironment(
  source: NodeJS.ProcessEnv = process.env,
) {
  const environment: Record<string, string> = { LANG: "en_US.UTF-8" };
  for (const key of [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "TZ",
  ])
    if (source[key] !== undefined) environment[key] = source[key];
  return environment;
}

export class PreviewBrowser {
  async capture({ origin, document: html, input, asset }: CaptureInput) {
    // The normal project browser installer supplies this location for local work.
    if (
      !process.env.PLAYWRIGHT_BROWSERS_PATH &&
      existsSync(resolve(".local/browsers"))
    )
      process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".local/browsers");
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      headless: true,
      timeout: 10000,
      chromiumSandbox: process.platform === "linux",
      env: previewBrowserEnvironment(),
    });
    const timeout = setTimeout(() => {
      void browser.close().catch(() => undefined);
    }, 20000);
    const width = input.device === "desktop" ? 1440 : 390;
    const warnings = new Set<string>();
    let active = true;
    try {
      const context = await browser.newContext({
        viewport: { width, height: input.device === "desktop" ? 1000 : 844 },
        deviceScaleFactor: 1,
        javaScriptEnabled: false,
        serviceWorkers: "block",
        acceptDownloads: false,
        permissions: [],
        reducedMotion: "reduce",
        locale: input.locale,
        colorScheme: "light",
      });
      const page = await context.newPage();
      let delivered = false;
      let requests = 0;
      let bytes = 0;
      let assetQueue: Promise<PreviewAsset | null> = Promise.resolve(null);
      let missingStyles = false;
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (
          ++requests > 160 ||
          request.method() !== "GET" ||
          url.origin !== origin ||
          url.search ||
          url.username ||
          url.password
        ) {
          await route.abort();
          return;
        }
        if (
          !delivered &&
          url.pathname === previewDocumentPath &&
          request.resourceType() === "document"
        ) {
          delivered = true;
          await route.fulfill({
            body: html,
            contentType: "text/html",
            headers: {
              "cache-control": "private, no-store",
              "content-security-policy":
                "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; script-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'",
            },
          });
          return;
        }
        if (!["stylesheet", "image", "font"].includes(request.resourceType())) {
          await route.abort();
          return;
        }
        const mediaId = /^\/media\/([0-9a-f-]{36})$/.exec(url.pathname)?.[1];
        // Serialize reads so concurrent image requests cannot each allocate their
        // whole file before the aggregate memory budget is checked.
        const resource = await (assetQueue = assetQueue.then(async () => {
          if (!active || bytes >= 25 * 1024 * 1024) return null;
          try {
            return mediaId
              ? await asset(mediaId)
              : await readPreviewStatic(url.pathname);
          } catch {
            return null;
          }
        }));
        if (!resource || (bytes += resource.bytes.length) > 25 * 1024 * 1024) {
          if (request.resourceType() === "stylesheet") missingStyles = true;
          if (request.resourceType() === "image")
            warnings.add(
              "Some images were unavailable or exceeded preview limits.",
            );
          await route.abort();
          return;
        }
        await route.fulfill({
          body: resource.bytes,
          contentType: resource.mimeType,
          headers: { "cache-control": "no-store" },
        });
      });
      await page.goto(`${origin}${previewDocumentPath}`, {
        waitUntil: "load",
        timeout: 12000,
      });
      if (missingStyles)
        throw new DomainError(
          "PREVIEW_UNAVAILABLE",
          "The website stylesheet is unavailable to the preview renderer.",
          503,
        );
      const revision = await page
        .locator("[data-automation-preview-revision]")
        .getAttribute("data-automation-preview-revision", { timeout: 2000 });
      if (revision !== input.expectedRevisionId)
        throw new DomainError(
          "PREVIEW_UNAVAILABLE",
          "The private renderer did not return the requested saved revision.",
          503,
        );
      // Only this fixed inspector code executes through CDP; page scripts remain disabled.
      await page.evaluate(() => {
        for (const image of document.querySelectorAll("img"))
          image.loading = "eager";
      });
      await page
        .waitForFunction(
          () => [...document.images].every((image) => image.complete),
          undefined,
          { timeout: 3000 },
        )
        .catch(() => {
          warnings.add(
            "Some images did not finish loading within the preview deadline.",
          );
        });
      const metrics = await page.evaluate(() => ({
        height: Math.ceil(document.documentElement.scrollHeight),
        width: Math.ceil(document.documentElement.scrollWidth),
      }));
      if (input.offsetY >= metrics.height)
        throw new DomainError(
          "PREVIEW_OFFSET_INVALID",
          "Choose an offset inside this page.",
          422,
        );
      const height = Math.min(2400, metrics.height - input.offsetY);
      const png = await page.screenshot({
        type: "png",
        fullPage: true,
        clip: { x: 0, y: input.offsetY, width, height },
        timeout: 6000,
        animations: "disabled",
      });
      let image = await sharp(png).webp({ quality: 65 }).toBuffer();
      if (image.length > 600 * 1024)
        image = await sharp(png).webp({ quality: 40 }).toBuffer();
      if (image.length > 600 * 1024)
        throw new DomainError(
          "PREVIEW_TOO_LARGE",
          "This screenshot exceeds the image limit. Simplify the page before previewing again.",
          413,
        );
      const following = input.offsetY + height;
      if (following < metrics.height && following > 30000)
        warnings.add(
          "This page extends beyond the 30000 pixel preview limit. Review the remainder in administration.",
        );
      return {
        width,
        height,
        offsetY: input.offsetY,
        pageHeight: Math.min(metrics.height, 1000000),
        nextOffsetY:
          following < metrics.height && following <= 30000 ? following : null,
        layoutOverflow: metrics.width > width + 1,
        image: {
          mimeType: "image/webp" as const,
          data: image.toString("base64"),
        },
        warnings: [...warnings],
      };
    } finally {
      active = false;
      clearTimeout(timeout);
      await browser.close();
    }
  }
}
