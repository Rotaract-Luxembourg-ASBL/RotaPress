import "server-only";
import type { z } from "zod";
import { DomainError } from "@/core/DomainError";
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

type ImageMime = z.infer<typeof imageMimeSchema>;
type MediaScope = "media:read" | "media:write" | "media:inspect";

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
  source: Buffer | (() => Promise<Buffer>),
  mimeType: ImageMime,
) {
  await requireMediaScope(context, "media:write");
  const metadata = mediaUploadMetadata.parse(input);
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
    const bytes = typeof source === "function" ? await source() : source;
    if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) {
      throw new DomainError(
        "UPLOAD_SIZE_INVALID",
        "Choose an image no larger than 5 MiB.",
        422,
      );
    }
    if (!matchesMime(bytes, mimeType)) {
      throw new DomainError(
        "UPLOAD_TYPE_INVALID",
        "The declared PNG, JPEG or WebP type must match the image bytes.",
        422,
      );
    }
    const asset = await context.services.media.upload(
      context.principal.actor,
      { ...metadata, bytes },
      () => requireMediaScope(context, "media:write", true),
    );
    const result = mediaDetailOutput.safeParse({
      asset,
      metadataRevision: mediaMetadataRevision(asset),
    });
    if (!result.success)
      throw new DomainError(
        "AUTOMATION_RESPONSE_INVALID",
        "The response did not match the API contract.",
        500,
      );
    return result.data;
  });
}
