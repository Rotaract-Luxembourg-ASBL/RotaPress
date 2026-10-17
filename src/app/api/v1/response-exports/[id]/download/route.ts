import { automationExportContext } from "@/composition/automation";
import { handle, HttpError } from "@/core/http";
import { exportDownloadResponse } from "@/integrations/automation/export_delivery";
import {
  requireAutomationOrigin,
  withRestChallenge,
} from "@/integrations/automation/http_boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function download(request: Request, context: Context) {
  return withRestChallenge(
    await handle(async () => {
      requireAutomationOrigin(request);
      if (new URL(request.url).search)
        throw new HttpError(
          400,
          "Download URLs do not accept query parameters.",
        );
      const current = await automationExportContext(request);
      try {
        const response = await exportDownloadResponse(
          current,
          (await context.params).id,
          request.method === "HEAD",
        );
        await current.recordActivity?.(
          "responses_export_download",
          "succeeded",
        );
        return response;
      } catch (error) {
        await current.recordActivity?.("responses_export_download", "failed");
        throw error;
      }
    }),
  );
}
export { download as GET, download as HEAD };
