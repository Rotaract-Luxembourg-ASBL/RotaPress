import "server-only";
import { DomainError } from "@/core/DomainError";
import { MAX_UPLOAD_BYTES } from "@/features/media/media_schemas";
import { referenceUrlSchema, robotsAllows } from "./reference_content";
import { imageMimeSchema } from "./media_schemas";
import { sourceRulesAllow } from "./source_rules";
import type { ReferenceTransport } from "./ReferenceWebsiteClient";

/** Approved public photos use the same pinned HTTPS boundary as reference pages. */
export class ReferenceImageClient {
  constructor(private readonly transport: ReferenceTransport) {}

  async inspect(raw: string, allowedRules: readonly string[]) {
    const url = new URL(referenceUrlSchema.parse(raw));
    if (!sourceRulesAllow(url, allowedRules))
      throw new DomainError(
        "SOURCE_ORIGIN_DENIED",
        "Approve this image's reference domain before importing it.",
        403,
      );
    try {
      const robots = await this.transport.read(
        `${url.origin}/robots.txt`,
        64000,
      );
      if (
        robots.status !== 404 &&
        (robots.status !== 200 ||
          !robotsAllows(robots.text, url.pathname + url.search))
      )
        throw new DomainError(
          "SOURCE_ROBOTS_DENIED",
          "The reference site's robots policy does not allow this image request.",
          422,
        );
      const response = await this.transport.read(url.href, MAX_UPLOAD_BYTES);
      const mime = imageMimeSchema.safeParse(
        response.type.split(";", 1)[0].trim().toLowerCase(),
      );
      if (response.status !== 200 || !mime.success)
        throw new DomainError(
          "SOURCE_IMAGE_REQUIRED",
          "Use the final public URL of a PNG, JPEG or WebP image. Redirects are not followed.",
          422,
        );
      if (!response.bytes?.length || response.bytes.length > MAX_UPLOAD_BYTES)
        throw new DomainError(
          "SOURCE_IMAGE_SIZE_INVALID",
          "Choose an image no larger than 5 MiB.",
          422,
        );
      return { bytes: response.bytes, mimeType: mime.data };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "SOURCE_IMAGE_UNAVAILABLE",
        "This image could not be read within the size and time limits.",
        422,
      );
    }
  }
}
