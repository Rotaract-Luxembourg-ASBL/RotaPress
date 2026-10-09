import { describe, expect, it } from "vitest";
import { ReferenceImageClient } from "../../src/integrations/automation/ReferenceImageClient";
import type { ReferenceTransport } from "../../src/integrations/automation/ReferenceWebsiteClient";
import { operationCatalogue } from "../../src/integrations/automation/catalogue";
import { MAX_UPLOAD_BYTES } from "../../src/features/media/media_schemas";

const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("C14 approved source image boundary", () => {
  it("exposes image ingestion only when both source reading and media writing are granted", () => {
    for (const scopes of [[], ["sources:read"], ["media:write"]])
      expect(operationCatalogue(scopes).map((item) => item.name)).not.toContain(
        "source_image_import",
      );
    expect(operationCatalogue(["sources:read", "media:write"])).toContainEqual(
      expect.objectContaining({
        name: "source_image_import",
        requiredScopes: ["media:write", "sources:read"],
        readOnly: false,
      }),
    );
  });

  it("checks the image host and its own robots policy before reading bounded image bytes", async () => {
    const calls: Array<{ url: string; maxBytes: number }> = [];
    let robots = "User-agent: *\nDisallow: /private";
    const transport: ReferenceTransport = {
      async read(url, maxBytes) {
        calls.push({ url, maxBytes });
        return url.endsWith("/robots.txt")
          ? { status: 200, type: "text/plain", text: robots }
          : { status: 200, type: "image/png", text: "", bytes };
      },
    };
    const client = new ReferenceImageClient(transport);
    await expect(
      client.inspect("https://evilrotaract.lu/photo.png", ["rotaract.lu"]),
    ).rejects.toMatchObject({ code: "SOURCE_ORIGIN_DENIED" });
    expect(calls).toHaveLength(0);
    await expect(
      client.inspect("https://www.rotaract.lu/private/photo.png", [
        "rotaract.lu",
      ]),
    ).rejects.toMatchObject({ code: "SOURCE_ROBOTS_DENIED" });
    expect(calls).toHaveLength(1);
    robots = "User-agent: *\nAllow: /";
    expect(
      await client.inspect("https://images.rotaract.lu/photo.png", [
        "rotaract.lu",
      ]),
    ).toEqual({ bytes, mimeType: "image/png" });
    expect(calls.slice(-2)).toEqual([
      { url: "https://images.rotaract.lu/robots.txt", maxBytes: 64000 },
      {
        url: "https://images.rotaract.lu/photo.png",
        maxBytes: MAX_UPLOAD_BYTES,
      },
    ]);
  });

  it("rejects redirects, active image types, oversized bodies and hidden transport diagnostics", async () => {
    const source = { status: 200, type: "image/png", text: "", bytes };
    let robotsStatus = 404;
    let fail = false;
    const client = new ReferenceImageClient({
      async read(url) {
        if (fail) throw new Error("internal diagnostic with synthetic secret");
        return url.endsWith("/robots.txt")
          ? { status: robotsStatus, type: "text/plain", text: "" }
          : source;
      },
    });
    const inspect = () =>
      client.inspect("https://rotaract.lu/photo.png", ["rotaract.lu"]);
    source.status = 302;
    await expect(inspect()).rejects.toMatchObject({
      code: "SOURCE_IMAGE_REQUIRED",
    });
    source.status = 200;
    for (const type of ["image/svg+xml", "text/html", "image/gif"]) {
      source.type = type;
      await expect(inspect()).rejects.toMatchObject({
        code: "SOURCE_IMAGE_REQUIRED",
      });
    }
    source.type = "image/png";
    source.bytes = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    await expect(inspect()).rejects.toMatchObject({
      code: "SOURCE_IMAGE_SIZE_INVALID",
    });
    robotsStatus = 302;
    await expect(inspect()).rejects.toMatchObject({
      code: "SOURCE_ROBOTS_DENIED",
    });
    fail = true;
    const error: unknown = await inspect().catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "SOURCE_IMAGE_UNAVAILABLE" });
    expect(String(error)).not.toContain("synthetic secret");
  });
});
