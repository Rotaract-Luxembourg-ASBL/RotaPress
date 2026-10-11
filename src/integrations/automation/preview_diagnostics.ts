import "server-only";
import { DomainError } from "@/core/DomainError";

export type PreviewFailureStage =
  | "load_snapshot"
  | "prepare_document"
  | "fetch_document"
  | "render_image"
  | "reauthorize"
  | "verify_revision";

function failureCode(stage: PreviewFailureStage, error: unknown) {
  if (error instanceof DomainError) {
    if (error.code !== "PREVIEW_UNAVAILABLE") return "PREVIEW_OPERATION_FAILED";
    switch (error.message) {
      case "The website stylesheet is unavailable to the preview renderer.":
        return "PREVIEW_STYLES_UNAVAILABLE";
      case "The private renderer did not return the requested saved revision.":
        return "PREVIEW_REVISION_UNAVAILABLE";
      case "The private renderer is unavailable. Retry after checking the application runtime.":
        return "PREVIEW_DOCUMENT_UNAVAILABLE";
      case "The visual preview runtime is unavailable.":
        return "PREVIEW_RUNTIME_UNAVAILABLE";
      default:
        return "PREVIEW_UNAVAILABLE";
    }
  }
  if (stage === "render_image" && error instanceof Error) {
    if (
      /No usable sandbox|Failed to move to new namespace|sandbox[^\n]*(?:failed|denied|not permitted)/i.test(
        error.message,
      )
    )
      return "CHROMIUM_SANDBOX_UNAVAILABLE";
    if (
      /Executable doesn't exist|browser executable[^\n]*not found/i.test(
        error.message,
      )
    )
      return "CHROMIUM_EXECUTABLE_UNAVAILABLE";
    if (error.name === "TimeoutError") return "PREVIEW_BROWSER_TIMEOUT";
  }
  return "PREVIEW_OPERATION_FAILED";
}

/** Emit only fixed stages/codes; exception text may contain credentials or private URLs. */
export function reportPreviewFailure(
  stage: PreviewFailureStage,
  error: unknown,
) {
  if (error instanceof DomainError && error.status < 500) return;
  console.error(
    JSON.stringify({
      event: "automation_preview_failed",
      stage,
      code: failureCode(stage, error),
    }),
  );
}
