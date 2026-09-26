import { expect, type APIRequestContext } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

/** Called by the principal identity journey with its real staff connection and synthetic page. */
export async function automationPreviewJourney(
  api: APIRequestContext,
  key: string,
  content: { id: string; revisionId: string },
) {
  const headers = { authorization: `Bearer ${key}` };
  for (const requestHeaders of [
    undefined,
    { authorization: `Bearer rp_preview_${"a".repeat(43)}` },
  ]) {
    const denied = await api.get("/automation-preview", {
      headers: requestHeaders,
    });
    expect(denied.status()).toBe(404);
    expect(denied.headers()["cache-control"]).toContain("no-store");
  }
  const path = `/api/v1/website/content/${content.id}/preview`;
  const invalid = await api.post(path, {
    headers,
    data: {
      expectedRevisionId: content.revisionId,
      url: "http://169.254.169.254/",
    },
  });
  expect(invalid.status()).toBe(400);
  const stale = await api.post(path, {
    headers,
    data: {
      expectedRevisionId: "10000000-0000-4000-8000-000000000099",
    },
  });
  expect(stale.status()).toBe(409);
  await mkdir(".local/screenshots", { recursive: true });
  const desktop = await api.post(path, {
    headers,
    data: {
      expectedRevisionId: content.revisionId,
      device: "desktop",
      locale: "en",
    },
  });
  expect(desktop.status(), await desktop.text()).toBe(200);
  expect(desktop.headers()["cache-control"]).toContain("no-store");
  const data = (await desktop.json()).data;
  expect(data).toMatchObject({
    id: content.id,
    revisionId: content.revisionId,
    width: 1440,
    device: "desktop",
    appearance: "published",
  });
  expect(data.image.mimeType).toBe("image/webp");
  const desktopBytes = Buffer.from(data.image.data, "base64");
  expect(await sharp(desktopBytes).metadata()).toMatchObject({
    format: "webp",
    width: data.width,
    height: data.height,
  });
  await writeFile(
    ".local/screenshots/automation-preview-desktop.webp",
    desktopBytes,
  );
  const phone = await api.post("/api/mcp", {
    headers: { ...headers, accept: "application/json, text/event-stream" },
    data: {
      jsonrpc: "2.0",
      id: 71,
      method: "tools/call",
      params: {
        name: "website_preview",
        arguments: {
          id: content.id,
          expectedRevisionId: content.revisionId,
          device: "phone",
          locale: "en",
        },
      },
    },
  });
  expect(phone.status()).toBe(200);
  const result = (await phone.json()).result;
  expect(result.isError).not.toBe(true);
  const images = result.content.filter(
    (block: { type: string }) => block.type === "image",
  );
  expect(images).toHaveLength(1);
  expect(images[0].mimeType).toBe("image/webp");
  const phoneBytes = Buffer.from(images[0].data, "base64");
  expect(await sharp(phoneBytes).metadata()).toMatchObject({
    format: "webp",
    width: 390,
  });
  await writeFile(
    ".local/screenshots/automation-preview-phone.webp",
    phoneBytes,
  );
  expect(
    JSON.stringify(
      result.content.filter((block: { type: string }) => block.type === "text"),
    ),
  ).not.toContain(images[0].data);
}
