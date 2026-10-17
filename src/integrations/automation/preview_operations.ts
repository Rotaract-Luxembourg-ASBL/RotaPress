import { DomainError } from "@/core/DomainError";
import { operation } from "./operation";
import { previewInput, previewOutput } from "./preview_schemas";
import { exampleId } from "./examples";
import { z } from "zod";
import {
  CmsCompositionPreview,
  compositionInput,
} from "@/features/cms/CmsCompositionPreview";

export const previewOperations = [
  operation(
    {
      name: "website_composition_review",
      method: "POST",
      path: "/website/content/{id}/composition",
      scope: "website:preview",
      requiredScopes: ["website:read"],
      effect: "read",
      readOnly: true,
      description:
        "Read the exact saved website settings version and shared draft revisions for a page before inspecting their combined preview. Does not save or publish anything. Pass this manifest to website_composition_preview.",
      input: previewInput.pick({
        id: true,
        locale: true,
        expectedRevisionId: true,
      }),
      output: compositionInput,
      example: { id: exampleId, locale: "en", expectedRevisionId: exampleId },
    },
    async ({ services, principal }, input) => {
      const detail = await services.cms.detail(
        principal.actor,
        input.id,
        input.locale,
      );
      if (detail.event || detail.kind !== "page")
        throw new DomainError(
          "PREVIEW_SCOPE",
          "Choose an ordinary website page for a combined website draft preview.",
          422,
        );
      if (detail.draft.id !== input.expectedRevisionId)
        throw new DomainError(
          "REVISION_CONFLICT",
          "Read the current saved page before previewing.",
          409,
        );
      return new CmsCompositionPreview(services.cms).review(
        principal.actor,
        input.id,
        input.locale,
        detail.draft.data,
      );
    },
  ),
  operation(
    {
      name: "website_composition_preview",
      method: "POST",
      path: "/website/content/{id}/composition-preview",
      scope: "website:preview",
      requiredScopes: ["website:read"],
      effect: "read",
      readOnly: true,
      description:
        "Inspect real desktop/phone pixels of an exact saved page together with draft appearance, menu, header, footer and reusable sections. Use website_composition_review's manifest. All versions are checked again after capture; changed compositions fail. Private images additionally require media:inspect. Interactive blocks remain placeholders.",
      input: previewInput.extend({ composition: compositionInput }),
      output: previewOutput.extend({
        appearance: z.literal("draft"),
        composition: compositionInput,
      }),
      example: {
        id: exampleId,
        locale: "en",
        expectedRevisionId: exampleId,
        device: "desktop",
        offsetY: 0,
        composition: { expectedSiteVersion: 1, parts: [] },
      },
    },
    async (context, { composition, ...input }) => {
      if (!context.reauthorize)
        throw new DomainError(
          "PREVIEW_UNAVAILABLE",
          "The visual preview authorization boundary is unavailable.",
          503,
        );
      const { WebsitePreviewService } = await import("./WebsitePreviewService");
      const result = await new WebsitePreviewService(context.services).capture(
        context.principal,
        input,
        context.reauthorize,
        {
          service: new CmsCompositionPreview(context.services.cms),
          expected: composition,
        },
      );
      return { ...result, appearance: "draft", composition };
    },
  ),
  operation(
    {
      name: "website_preview",
      effect: "read",
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
