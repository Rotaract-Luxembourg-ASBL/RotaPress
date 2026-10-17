import { expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { mediaCodecFixtures } from "../critical/media-codec-fixtures";
import type { AdminMediaAssetDto } from "../../src/features/media/media_schemas";
import { videoBlockJourney } from "./video-block-journey";

/** B02: actual browser upload recovery, private ranges and native playback. */
export async function mediaFilesJourney(page: Page, visitor: Page) {
  const document = await PDFDocument.create();
  const raster = await sharp(randomBytes(1300 * 1300 * 3), {
    raw: { width: 1300, height: 1300, channels: 3 },
  })
    .png()
    .toBuffer();
  const image = await document.embedPng(raster);
  document
    .addPage([1300, 1300])
    .drawImage(image, { x: 0, y: 0, width: 1300, height: 1300 });
  const pdf = Buffer.from(await document.save());
  expect(pdf.length).toBeGreaterThan(4 * 1024 * 1024);
  const prefix = "Workspace file delivery";
  await page.goto("/admin/media");
  await page.getByRole("button", { name: "Upload files", exact: true }).click();
  const upload = page.getByRole("dialog", {
    name: "Upload files",
    exact: true,
  });
  await upload.getByLabel("Media file", { exact: true }).setInputFiles({
    name: `${prefix}.pdf`,
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(
    upload.getByRole("combobox", { name: "Visibility", exact: true }),
  ).toHaveValue("public");
  let firstChunks = 0;
  const chunkPattern = /\/api\/admin\/media\/uploads\/[^/?]+\?chunk=\d+$/;
  let interrupted = false;
  await page.route(chunkPattern, async (route) => {
    const index = new URL(route.request().url()).searchParams.get("chunk");
    if (index === "0") firstChunks++;
    if (index === "1" && !interrupted) {
      interrupted = true;
      await route.abort("connectionreset");
    } else await route.continue();
  });
  try {
    await upload
      .getByRole("button", { name: "Upload 1 file", exact: true })
      .click();
    await expect(
      upload.getByRole("button", { name: "Retry failed uploads", exact: true }),
    ).toBeEnabled();
    expect(interrupted).toBe(true);
    await upload
      .getByRole("button", { name: "Retry failed uploads", exact: true })
      .click();
    await expect(upload.getByRole("status")).toHaveText(
      "1 of 1 files uploaded.",
    );
    expect(firstChunks).toBe(1);
  } finally {
    await page.unroute(chunkPattern);
  }
  await upload.getByRole("button", { name: "Done", exact: true }).click();
  const read = async () => {
    const response = await page.request.get(
      `/api/admin/media?search=${encodeURIComponent(prefix)}`,
    );
    expect(response.ok()).toBe(true);
    return (await response.json()) as {
      assets: AdminMediaAssetDto[];
      total: number;
    };
  };
  const pdfResult = await read();
  expect(pdfResult.total).toBe(1);
  const storedPdf = pdfResult.assets[0];
  expect(storedPdf).toMatchObject({
    kind: "document",
    visibility: "public",
    size: pdf.length,
  });
  const download = await visitor.request.get(
    `/media/${storedPdf.id}?download=1`,
  );
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain("attachment;");
  expect(await download.body()).toEqual(pdf);

  await page.getByRole("button", { name: "Upload files", exact: true }).click();
  await upload.getByLabel("Media file", { exact: true }).setInputFiles([
    {
      name: `${prefix} audio.m4a`,
      mimeType: "audio/mp4",
      buffer: Buffer.from(mediaCodecFixtures["aac.m4a"], "base64"),
    },
    {
      name: `${prefix} video.webm`,
      mimeType: "video/webm",
      buffer: Buffer.from(mediaCodecFixtures["vp8.webm"], "base64"),
    },
  ]);
  await upload
    .getByRole("combobox", { name: "Visibility", exact: true })
    .selectOption("private");
  await upload
    .getByRole("button", { name: "Upload 2 files", exact: true })
    .click();
  await expect(upload.getByRole("status")).toHaveText("2 of 2 files uploaded.");
  await upload.getByRole("button", { name: "Done", exact: true }).click();
  const files = (await read()).assets;
  expect(files).toHaveLength(3);
  for (const kind of ["audio", "video"] as const) {
    const asset = files.find((file) => file.kind === kind)!;
    expect(asset.visibility).toBe("private");
    const denied = await visitor.request.get(`/media/${asset.id}`, {
      headers: { Range: "bytes=0-31" },
    });
    expect(denied.status()).toBe(404);
    const range = await page.request.get(`/media/${asset.id}`, {
      headers: { Range: "bytes=0-31" },
    });
    expect(range.status()).toBe(206);
    expect(range.headers()["cache-control"]).toContain("private");
    expect(range.headers()["content-range"]).toBe(`bytes 0-31/${asset.size}`);
    expect((await range.body()).length).toBe(32);
    await page.goto(`/admin/media?asset=${asset.id}`);
    const details = page.getByRole("dialog", {
      name: "File details",
      exact: true,
    });
    const player = details.locator(kind);
    await expect(player).toBeVisible();
    await expect
      .poll(() =>
        player.evaluate((element: HTMLMediaElement) => element.readyState),
      )
      .toBeGreaterThanOrEqual(1);
    expect(
      await player.evaluate((element: HTMLMediaElement) => element.controls),
    ).toBe(true);
    await player.evaluate(async (element: HTMLMediaElement) => {
      element.muted = true;
      await element.play();
    });
    await expect
      .poll(() =>
        player.evaluate((element: HTMLMediaElement) => element.currentTime),
      )
      .toBeGreaterThan(0);
    expect(
      await player.evaluate((element: HTMLMediaElement) => element.error),
    ).toBeNull();
    await page.keyboard.press("Escape");
  }
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/admin/media?asset=${storedPdf.id}`);
    const details = page.getByRole("dialog", {
      name: "File details",
      exact: true,
    });
    await expect(
      details.getByRole("link", { name: "Download PDF", exact: true }),
    ).toBeVisible();
    expect(
      await details.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    await details.screenshot({ path: `.local/media-file-${width}.png` });
  }
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const video = files.find((file) => file.kind === "video");
  expect(video).toBeDefined();
  await videoBlockJourney(page, visitor, video!);
}
