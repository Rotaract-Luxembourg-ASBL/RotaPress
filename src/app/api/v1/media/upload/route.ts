import { automationContext } from "@/composition/automation";
import { handle, HttpError, json } from "@/core/http";
import { requireAutomationOrigin } from "@/integrations/automation/http_boundary";
import {
  imageMimeSchema,
  mediaUploadMetadata,
} from "@/integrations/automation/media_schemas";
import {
  requireMediaScope,
  uploadAutomationImage,
} from "@/integrations/automation/media_upload";
import { readMediaBody } from "@/integrations/automation/media_body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    requireAutomationOrigin(request);
    const context = await automationContext(request, "rest");
    await requireMediaScope(context, "media:write");
    if (new URL(request.url).search)
      throw new HttpError(400, "Upload options belong in the metadata header.");
    const mime = imageMimeSchema.safeParse(request.headers.get("content-type"));
    if (!mime.success)
      throw new HttpError(
        415,
        "Use image/png, image/jpeg or image/webp with a binary body.",
      );
    const header = request.headers.get("x-rotapress-upload") ?? "";
    if (!header || header.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(header)) {
      throw new HttpError(
        400,
        "Provide base64url JSON upload metadata in X-RotaPress-Upload.",
      );
    }
    const decoded = Buffer.from(header, "base64url");
    if (decoded.toString("base64url") !== header)
      throw new HttpError(400, "Use canonical base64url metadata.");
    let values: unknown;
    try {
      values = JSON.parse(decoded.toString("utf8"));
    } catch {
      throw new HttpError(400, "Upload metadata is invalid JSON.");
    }
    const metadata = mediaUploadMetadata.parse(values);
    // Actual streamed bytes are bounded; Content-Length is never authoritative.
    return json({
      data: await uploadAutomationImage(
        context,
        metadata,
        () => readMediaBody(request),
        mime.data,
      ),
    });
  });
}
