import { DomainError } from "@/core/DomainError";
import { operation } from "./operation";
import { previewInput, previewOutput } from "./preview_schemas";
import { exampleId } from "./examples";

export const previewOperations = [
  operation(
    {
      name: "website_preview",
      method: "POST",
      path: "/website/content/{id}/preview",
      scope: "website:preview",
      readOnly: true,
      description:
        "Inspect actual desktop or phone pixels of an exact saved draft with published website appearance. Requires website:read; private images additionally require media:inspect. JavaScript and interactive blocks are inactive. Follow nextOffsetY for long pages. Review manually before publication.",
      input: previewInput,
      output: previewOutput,
      example: {
        id: exampleId,
        locale: "en",
        expectedRevisionId: exampleId,
        device: "desktop",
        offsetY: 0,
      },
    },
    async (context, input) => {
      if (!context.reauthorize)
        throw new DomainError(
          "PREVIEW_UNAVAILABLE",
          "The visual preview authorization boundary is unavailable.",
          503,
        );
      const { WebsitePreviewService } = await import("./WebsitePreviewService");
      return new WebsitePreviewService(context.services).capture(
        context.principal,
        input,
        context.reauthorize,
      );
    },
  ),
];
