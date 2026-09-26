import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "../../src/core/DomainError";
import type { AutomationContext } from "../../src/integrations/automation/operation";
import { mediaOperations } from "../../src/integrations/automation/media_operations";
import { mediaUploadInput } from "../../src/integrations/automation/media_schemas";
import { MAX_UPLOAD_BYTES } from "../../src/features/media/media_schemas";
import { readMediaBody } from "../../src/integrations/automation/media_body";
import {
  inspectImage,
  mediaMetadataRevision,
  withAutomationImageWork,
} from "../../src/features/media/media_automation";

const mocks = vi.hoisted(() => ({
  context: vi.fn<() => Promise<AutomationContext>>(),
}));
vi.mock("@/composition/automation", () => ({
  automationContext: mocks.context,
}));
vi.mock("@/core/config", () => ({
  config: { APP_URL: "http://127.0.0.1:3000" },
}));
import { POST } from "../../src/app/api/v1/media/upload/route";

const origin = "http://127.0.0.1:3000";
const organizationId = randomUUID();
const actorId = randomUUID();
const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const metadata = {
  requestId: randomUUID(),
  filename: "fixture.png",
  alt: "Synthetic fixture",
};
const asset = {
  id: randomUUID(),
  visibility: "private" as const,
  mimeType: "image/webp" as const,
  originalName: "fixture.png",
  size: 44,
  width: 1,
  height: 1,
  title: "",
  alt: "Synthetic fixture",
  caption: "",
  tags: [],
  collection: "",
  createdAt: new Date().toISOString(),
};
let context: AutomationContext;
const authorize = vi.fn();
const quota = vi.fn();
const upload = vi.fn();
const inspect = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue({ organizationId });
  quota.mockResolvedValue(undefined);
  upload.mockImplementation(async (_actor, _input, reauthorize) => {
    await reauthorize?.();
    return asset;
  });
  inspect.mockResolvedValue({
    asset,
    image: { data: "YWJj", mimeType: "image/webp", width: 1, height: 1 },
  });
  // Transport-only dependency fixtures; media.test.ts checks actual database authority.
  context = {
    principal: {
      actor: { userId: actorId },
      keyId: "synthetic-key",
      organizationId,
      scopes: ["media:read", "media:write", "media:inspect"],
      sourceOrigins: [],
    },
    services: {
      authorization: { require: authorize },
      limiter: { consume: quota },
      media: { upload, inspect },
    },
  } as unknown as AutomationContext;
  context.reauthorize = async () => context.principal;
  mocks.context.mockResolvedValue(context);
});

function request(
  bytes: Buffer = imageBytes,
  values: unknown = metadata,
  headers: Record<string, string> = {},
) {
  return new Request(`${origin}/api/v1/media/upload`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "image/png",
      "x-rotapress-upload": Buffer.from(JSON.stringify(values)).toString(
        "base64url",
      ),
      ...headers,
    },
    body: new Uint8Array(bytes),
  });
}

describe("C14 bounded media automation transports", () => {
  it("checks origin, bearer authority and media write grants before consuming the body", async () => {
    const foreign = request(imageBytes, metadata, {
      origin: "https://other.example",
    });
    expect((await POST(foreign)).status).toBe(403);
    expect(foreign.bodyUsed).toBe(false);
    expect(mocks.context).not.toHaveBeenCalled();
    mocks.context.mockRejectedValueOnce(
      new DomainError(
        "AUTOMATION_AUTH_REQUIRED",
        "Use a current connection.",
        401,
      ),
    );
    const anonymous = request();
    expect((await POST(anonymous)).status).toBe(401);
    expect(anonymous.bodyUsed).toBe(false);
    context.principal.scopes = ["media:read"];
    const readOnly = request();
    expect((await POST(readOnly)).status).toBe(403);
    expect(readOnly.bodyUsed).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it("bounds actual bytes and metadata, rejects path/URL/authority fields and mismatched MIME", async () => {
    const oversized = request(Buffer.alloc(MAX_UPLOAD_BYTES + 1), metadata, {
      "content-length": "1",
    });
    const response = await POST(oversized);
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
    for (const values of [
      { ...metadata, sourceUrl: "http://169.254.169.254/" },
      { ...metadata, organizationId: randomUUID() },
      { ...metadata, visibility: "public" },
      { ...metadata, filename: "../secret.png" },
    ])
      expect((await POST(request(imageBytes, values))).status).toBe(400);
    expect(
      (
        await POST(
          request(imageBytes, metadata, {
            "x-rotapress-upload": "a".repeat(8193),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request(imageBytes, metadata, { "content-type": "text/html" }),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await POST(
          request(imageBytes, metadata, { "content-type": "image/jpeg" }),
        )
      ).status,
    ).toBe(422);
    expect(upload).not.toHaveBeenCalled();
  });

  it("shares the private upload path and budgets while preserving idempotency metadata", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { asset, metadataRevision: mediaMetadataRevision(asset) },
    });
    expect(upload).toHaveBeenCalledWith(
      context.principal.actor,
      expect.objectContaining({ ...metadata, bytes: imageBytes }),
      expect.any(Function),
    );
    expect(quota).toHaveBeenCalledWith("media-upload", actorId, 20);
    expect(quota).toHaveBeenCalledWith(
      "automation-media-daily",
      organizationId,
      200,
      86400,
    );
    context.reauthorize = async () => ({ ...context.principal, scopes: [] });
    expect((await POST(request())).status).toBe(403);
  });

  it("rejects malformed base64 and large MCP uploads without broadening JSON limits", async () => {
    const operation = mediaOperations.find(
      (item) => item.name === "media_upload",
    )!;
    for (const data of [
      "data:image/png;base64,aGVsbG8=",
      "YQ",
      "YQ==\n",
      "YQ=",
      "a".repeat(245764),
    ]) {
      expect(
        mediaUploadInput.safeParse({ ...metadata, mimeType: "image/png", data })
          .success,
      ).toBe(false);
    }
    // Nonzero unused padding bits decode successfully in Buffer but are not canonical base64.
    await expect(
      operation.run(context, {
        ...metadata,
        mimeType: "image/png",
        data: "YR==",
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_ENCODING_INVALID" });
    expect(upload).not.toHaveBeenCalled();
    await operation.run(context, {
      ...metadata,
      mimeType: "image/png",
      data: imageBytes.toString("base64"),
    });
    expect(upload).toHaveBeenCalledOnce();
  });

  it("fails closed with a generic server error if a future media DTO contains private fields", async () => {
    upload.mockResolvedValue({
      ...asset,
      privateCredential: "synthetic-private-media-field",
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(request());
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "The request could not be completed. Please try again.",
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        "synthetic-private-media-field",
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain("privateCredential");
    } finally {
      log.mockRestore();
    }
  });

  it("requires explicit pixel scope and rechecks revoked connections after inspection", async () => {
    const operation = mediaOperations.find(
      (item) => item.name === "media_inspect",
    )!;
    context.principal.scopes = ["media:read"];
    await expect(
      operation.run(context, { id: asset.id }),
    ).rejects.toMatchObject({ status: 403 });
    expect(inspect).not.toHaveBeenCalled();
    context.principal.scopes = ["media:inspect"];
    context.reauthorize = async () => {
      throw new DomainError("REVOKED", "Connection revoked.", 401);
    };
    await expect(
      operation.run(context, { id: asset.id }),
    ).rejects.toMatchObject({ status: 401 });
    expect(inspect).toHaveBeenCalledOnce();
  });

  it("returns bounded real decoded pixels without EXIF or executable container payload", async () => {
    const image = await sharp({
      create: { width: 2048, height: 1536, channels: 3, background: "#125b7c" },
    })
      .withExif({ IFD0: { Artist: "Synthetic private author" } })
      .jpeg()
      .toBuffer();
    const result = await inspectImage(
      Buffer.concat([image, Buffer.from("<script>synthetic</script>")]),
    );
    const output = Buffer.from(result.data, "base64");
    const info = await sharp(output).metadata();
    expect(result).toMatchObject({
      mimeType: "image/webp",
      width: 1024,
      height: 768,
    });
    expect(output.length).toBeLessThanOrEqual(180 * 1024);
    expect(info.exif).toBeUndefined();
    expect(output.includes(Buffer.from("<script>"))).toBe(false);
    await expect(
      inspectImage(Buffer.from("<svg>invalid</svg>")),
    ).rejects.toMatchObject({ code: "MEDIA_INSPECTION_FAILED" });
  });

  it("bounds concurrent image work and releases capacity after a failure", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = [
      withAutomationImageWork(() => gate),
      withAutomationImageWork(async () => {
        await gate;
        throw new Error("Synthetic processing failure");
      }),
    ];
    await expect(
      withAutomationImageWork(async () => "overflow"),
    ).rejects.toMatchObject({ code: "MEDIA_BUSY", status: 429 });
    release();
    const outcomes = await Promise.allSettled(running);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(await withAutomationImageWork(async () => "available")).toBe(
      "available",
    );
  });

  it("cancels a slow binary stream instead of retaining image processing capacity", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const slowRequest = new Request(`${origin}/api/v1/media/upload`, {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(readMediaBody(slowRequest, 10)).rejects.toMatchObject({
      status: 408,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
