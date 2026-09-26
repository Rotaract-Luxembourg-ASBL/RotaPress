import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { automationPreviewJourney } from "./automation-preview-journey";

/** Extends B01 with real session-issued credentials; the uploaded pixels are synthetic. */
export async function automationMediaJourney(
  owner: Page,
  api: APIRequestContext,
  restrictedKey: string,
) {
  const issued = await owner.request.post(
    "/api/admin/integrations/automation",
    {
      headers: { origin: smokeOrigin },
      data: {
        name: "Synthetic media assistant",
        scopes: [
          "media:read",
          "media:write",
          "media:inspect",
          "website:read",
          "website:write",
          "website:preview",
        ],
      },
    },
  );
  expect(issued.status()).toBe(200);
  const connection = (await issued.json()) as { id: string; key: string };
  const bearer = { authorization: `Bearer ${connection.key}` };
  const image = await sharp({
    create: { width: 64, height: 48, channels: 3, background: "#35675b" },
  })
    .png()
    .toBuffer();
  const metadata = {
    requestId: randomUUID(),
    filename: "synthetic-event.png",
    alt: "Synthetic green event artwork",
  };
  try {
    const headers = {
      ...bearer,
      "content-type": "image/png",
      "x-rotapress-upload": Buffer.from(JSON.stringify(metadata)).toString(
        "base64url",
      ),
    };
    const upload = await api.post("/api/v1/media/upload", {
      headers,
      data: image,
    });
    expect(upload.status()).toBe(200);
    expect(upload.headers()["cache-control"]).toContain("no-store");
    const uploaded = (await upload.json()).data;
    expect(uploaded.asset.visibility).toBe("private");
    expect(uploaded.asset).not.toHaveProperty("storageKey");
    const assetId: string = uploaded.asset.id;
    expect((await api.get(`/media/${assetId}`)).status()).toBe(404);
    expect(
      (
        await api.get(`/api/v1/media/${assetId}/image`, {
          headers: { authorization: `Bearer ${restrictedKey}` },
        })
      ).status(),
    ).toBe(403);

    const rpc = (name: string, args: Record<string, unknown>) =>
      api.post("/api/mcp", {
        headers: { ...bearer, accept: "application/json, text/event-stream" },
        data: {
          jsonrpc: "2.0",
          id: 27,
          method: "tools/call",
          params: { name, arguments: args },
        },
      });
    const retry = await rpc("media_upload", {
      ...metadata,
      mimeType: "image/png",
      data: image.toString("base64"),
    });
    expect(retry.status()).toBe(200);
    const retried = (await retry.json()).result;
    expect(retried.isError).toBe(false);
    expect(retried.structuredContent.data.asset.id).toBe(assetId);
    const inspection = await rpc("media_inspect", { id: assetId });
    expect(inspection.status()).toBe(200);
    const inspected = (await inspection.json()).result;
    expect(inspected.isError).toBe(false);
    const imageBlock = inspected.content.find(
      (part: { type: string }) => part.type === "image",
    );
    expect(imageBlock.mimeType).toBe("image/webp");
    expect(
      (await sharp(Buffer.from(imageBlock.data, "base64")).metadata()).width,
    ).toBe(64);
    const text = inspected.content.find(
      (part: { type: string }) => part.type === "text",
    );
    expect(text.text.includes(imageBlock.data)).toBe(false);

    const edit = {
      expectedRevision: uploaded.metadataRevision,
      title: "Event artwork",
      alt: metadata.alt,
      caption: "Synthetic local fixture",
      tags: [],
      collection: "Events",
    };
    expect(
      (
        await api.patch(`/api/v1/media/${assetId}/metadata`, {
          headers: bearer,
          data: edit,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await api.patch(`/api/v1/media/${assetId}/metadata`, {
          headers: bearer,
          data: edit,
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await api.patch(`/api/v1/media/${assetId}/metadata`, {
          headers: bearer,
          data: { ...edit, visibility: "public" },
        })
      ).status(),
    ).toBe(400);

    const slug = `ai-media-${randomUUID().slice(0, 8)}`;
    const creation = await api.post("/api/v1/website/content", {
      headers: bearer,
      data: {
        kind: "page",
        locale: "en",
        title: "Event artwork draft",
        slug,
        templateId: "blank",
      },
    });
    expect(creation.status()).toBe(200);
    const created = (await creation.json()).data;
    const save = await api.patch(`/api/v1/website/content/${created.id}`, {
      headers: bearer,
      data: {
        locale: "en",
        expectedRevisionId: created.draft.id,
        title: created.draft.title,
        slug,
        description: "Synthetic AI-assisted draft",
        socialImageId: null,
        data: {
          root: { props: {} },
          content: [
            {
              type: "Image",
              props: {
                id: "ai-event-image",
                version: 1,
                assetId,
                alt: metadata.alt,
                caption: "Synthetic local fixture",
              },
            },
          ],
        },
      },
    });
    expect(save.status()).toBe(200);
    const saved = (await save.json()).data;
    expect(saved.publishedRevisionId).toBeNull();
    await automationPreviewJourney(api, connection.key, {
      id: created.id,
      revisionId: saved.draft.id,
    });
    expect((await api.get(`/pages/en/${slug}`)).status()).toBe(404);
    expect(
      (
        await api.get(`/admin/website/${created.id}/preview?locale=en`, {
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(307);
    await owner.goto(`/admin/website/${created.id}/preview?locale=en`);
    const visibleImage = owner.getByRole("img", {
      name: metadata.alt,
      exact: true,
    });
    await expect(visibleImage).toBeVisible();
    expect(
      await visibleImage.evaluate(
        (element) =>
          element instanceof HTMLImageElement && element.naturalWidth > 0,
      ),
    ).toBe(true);
    return { pageId: created.id as string, assetId };
  } finally {
    expect(
      (
        await owner.request.delete("/api/admin/integrations/automation", {
          headers: { origin: smokeOrigin },
          data: { id: connection.id },
        })
      ).status(),
    ).toBe(200);
  }
}
