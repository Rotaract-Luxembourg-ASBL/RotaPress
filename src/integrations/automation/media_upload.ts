import "server-only";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { DomainError } from "@/core/DomainError";
import type { Transaction } from "@/core/authorization/AuthorizationService";
import { MAX_UPLOAD_BYTES } from "@/features/media/media_schemas";
import {
  mediaMetadataRevision,
  withAutomationImageWork,
} from "@/features/media/media_automation";
import type { AutomationContext } from "./operation";
import {
  mediaDetailOutput,
  mediaUploadMetadata,
  type imageMimeSchema,
} from "./media_schemas";
import { executeReceipt } from "./receipt_service";

type ImageMime = z.infer<typeof imageMimeSchema>;
type MediaScope =
  "media:read" | "media:write" | "media:inspect" | "media:publish";

/** Also protects the binary route, which intentionally does not use JSON dispatch. */
export async function requireMediaScope(
  context: AutomationContext,
  scope: MediaScope,
  refresh = false,
) {
  const principal =
    refresh && context.reauthorize
      ? await context.reauthorize()
      : context.principal;
  if (
    principal.actor.userId !== context.principal.actor.userId ||
    principal.organizationId !== context.principal.organizationId ||
    principal.keyId !== context.principal.keyId ||
    !principal.scopes.includes(scope)
  ) {
    throw new DomainError(
      "AUTOMATION_SCOPE_REQUIRED",
      `This connection needs ${scope}.`,
      403,
    );
  }
  const current = await context.services.authorization.require(
    principal.actor,
    "media.manage",
  );
  if (current.organizationId !== principal.organizationId) {
    throw new DomainError(
      "AUTOMATION_ORGANIZATION_CHANGED",
      "Create a connection for the current club.",
      403,
    );
  }
}

function matchesMime(bytes: Buffer, mime: ImageMime) {
  if (mime === "image/png")
    return (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  if (mime === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  return (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  );
}

/** Both transports use the same private upload, authority, quotas and retry receipt. */
export async function uploadAutomationImage(
  context: AutomationContext,
  input: unknown,
  source:
    Buffer | (() => Promise<Buffer | { bytes: Buffer; mimeType: ImageMime }>),
  mimeType?: ImageMime,
  sourceFingerprint?: string,
  operationName: "media_upload" | "source_image_import" = "media_upload",
) {
  await requireMediaScope(context, "media:write");
  const { taskId, expectedGeneration, ...metadata } =
    mediaUploadMetadata.parse(input);
  const receiptInput = (bytes?: Buffer, declaredMime?: ImageMime) => ({
    ...metadata,
    taskId,
    expectedGeneration,
    ...(sourceFingerprint
      ? { sourceFingerprint }
      : {
          mimeType: declaredMime,
          sha256: bytes
            ? createHash("sha256").update(bytes).digest("hex")
            : undefined,
        }),
  });
  const authorize = (tx: Transaction) =>
    context.services.authorization.require(
      context.principal.actor,
      "media.manage",
      tx,
    );
  const recover = async (envelope: ReturnType<typeof receiptInput>) => {
    const result = await context.services.automationRuntime.recover(
      context,
      operationName,
      envelope,
      mediaDetailOutput,
      authorize,
    );
    if (!result.found) return null;
    await context.services.media.detail(
      context.principal.actor,
      result.value.asset.id,
    );
    return result.value;
  };
  const knownInput = sourceFingerprint || Buffer.isBuffer(source);
  if (knownInput) {
    const recovered = await recover(
      receiptInput(Buffer.isBuffer(source) ? source : undefined, mimeType),
    );
    if (recovered) return recovered;
  }
  // Share the interactive upload budget; new connections cannot bypass it.
  await context.services.limiter.consume(
    "media-upload",
    context.principal.actor.userId,
    20,
  );
  try {
    await context.services.limiter.consume(
      "automation-media-daily",
      context.principal.organizationId,
      200,
      86400,
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "RATE_LIMITED") {
      throw new DomainError(
        "MEDIA_DAILY_LIMIT",
        "The daily image upload limit was reached. Try again after the club's 24-hour quota window ends.",
        429,
      );
    }
    throw error;
  }
  return withAutomationImageWork(async () => {
    // Reserve bounded work before buffering a larger original image from REST.
    const result = typeof source === "function" ? await source() : source;
    const bytes = Buffer.isBuffer(result) ? result : result.bytes;
    const declaredMime = Buffer.isBuffer(result) ? mimeType : result.mimeType;
    if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) {
      throw new DomainError(
        "UPLOAD_SIZE_INVALID",
        "Choose an image no larger than 5 MiB.",
        422,
      );
    }
    if (!declaredMime || !matchesMime(bytes, declaredMime)) {
      throw new DomainError(
        "UPLOAD_TYPE_INVALID",
        "The declared PNG, JPEG or WebP type must match the image bytes.",
        422,
      );
    }
    const envelope = receiptInput(bytes, declaredMime);
    if (!knownInput) {
      const recovered = await recover(envelope);
      if (recovered) return recovered;
    }
    const asset = await context.services.media.upload(
      context.principal.actor,
      {
        ...metadata,
        bytes,
        ...(sourceFingerprint ? { sourceFingerprint } : {}),
      },
      () => requireMediaScope(context, "media:write", true),
      async (persist) => {
        const receipt = await executeReceipt(
          context,
          operationName,
          envelope,
          mediaDetailOutput,
          authorize,
          async (tx) => {
            const stored = await persist(tx);
            return {
              asset: stored,
              metadataRevision: mediaMetadataRevision(stored),
            };
          },
        );
        return { ...receipt.asset, kind: "image" };
      },
    );
    const output = mediaDetailOutput.safeParse({
      asset,
      metadataRevision: mediaMetadataRevision(asset),
    });
    if (!output.success)
      throw new DomainError(
        "AUTOMATION_RESPONSE_INVALID",
        "The response did not match the API contract.",
        500,
      );
    return output.data;
  });
}
