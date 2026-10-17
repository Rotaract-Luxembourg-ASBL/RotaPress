import { z } from "zod";
import {
  pageQuerySchema,
  quickEditSchema,
  patternSaveSchema,
  pageMoveSchema,
  pageBatchSchema,
} from "@/features/cms/cms_workspace_schemas";
import { websiteSummaryOutput } from "./response_schemas";
import { operation } from "./operation";
import { executeReceipt, receiptFields } from "./receipt_service";
import { requireNonExecutableContent } from "./website_content_policy";
import { exampleId } from "./examples";
import { receiptOperation } from "./receipt_operation";
import { requireReceiptCapability } from "./receipt_authority";

const savedPattern = z.strictObject({ id: z.uuid(), revisionId: z.uuid() });
const savedPlacement = savedPattern.extend({
  placementVersion: z.int().positive(),
});
export const websiteWorkspaceOperations = [
  receiptOperation(
    {
      name: "website_pages_restore",
      method: "POST",
      path: "/website/pages/restore",
      scope: "website:organize",
      requiredScopes: ["website:manage"],
      effect: "draft",
      description:
        "Restore the exact selected archived club pages or sections as private drafts. Requires current native publication authority and exact draft revisions. Preserves retained history and does not publish or restore menu placements. CustomCode remains unavailable to automation.",
      input: z.strictObject({ items: pageBatchSchema.shape.items }),
      output: z.strictObject({ updated: z.int().positive() }),
      example: {
        items: [
          {
            id: exampleId,
            locale: "en",
            expectedRevisionId: exampleId,
            archived: true,
          },
        ],
      },
    },
    requireReceiptCapability("cms.publish"),
    async ({ services, principal }, input, tx) => {
      for (const item of input.items) {
        const detail = await services.cms.detail(
          principal.actor,
          item.id,
          item.locale,
          tx,
        );
        requireNonExecutableContent(detail.draft.data);
      }
      return services.cms.workspace.batch(
        principal.actor,
        { action: "restore-archived", items: input.items },
        tx,
      );
    },
  ),
  operation(
    {
      name: "website_pages",
      method: "GET",
      path: "/website/pages",
      scope: "website:read",
      effect: "read",
      description:
        "Search and paginate native pages or reusable sections by language, draft/public status and collection. Parent hierarchy and position organize administration; each page keeps its independent URL slug.",
      input: pageQuerySchema.strict(),
      output: z.strictObject({
        items: z.array(
          websiteSummaryOutput.extend({
            parentId: z.uuid().nullable(),
            parentTitle: z.string().nullable(),
            position: z.int().nonnegative(),
            placementVersion: z.int().nonnegative(),
            childCount: z.int().nonnegative(),
          }),
        ),
        page: z.int().positive(),
        pageSize: z.int().positive(),
        total: z.int().nonnegative(),
        counts: z.record(
          z.enum(["all", "draft", "published", "changes", "archived"]),
          z.int().nonnegative(),
        ),
      }),
      example: { locale: "en", kind: "page", page: 1, pageSize: 25 },
    },
    ({ services, principal }, input) =>
      services.cms.workspace.list(principal.actor, input),
  ),
  receiptOperation(
    {
      name: "website_page_move",
      method: "POST",
      path: "/website/pages/{id}/move",
      scope: "website:organize",
      effect: "draft",
      description:
        "Move the requested page beneath a parent and before a specific sibling, or append it. Current page, placement and sibling versions protect ordering. Hierarchy does not change public URLs or navigation. Cycles and unavailable parents are rejected.",
      input: pageMoveSchema,
      output: savedPlacement.extend({
        parentId: z.uuid().nullable(),
        position: z.int().nonnegative(),
      }),
      example: {
        id: exampleId,
        locale: "en",
        expectedRevisionId: exampleId,
        expectedPlacementVersion: 0,
        parentId: null,
        beforeId: null,
      },
    },
    requireReceiptCapability("cms.edit"),
    ({ services, principal }, input, tx) =>
      services.pageTree.move(principal.actor, input, tx),
  ),
  operation(
    {
      name: "website_page_organize",
      method: "POST",
      path: "/website/pages/{id}/placement",
      scope: "website:organize",
      requiredScopes: ["website:write"],
      effect: "draft",
      description:
        "Save the requested page title, independent URL slug, parent and order as a draft using exact content and placement versions. Does not publish or modify public navigation. Executable custom-code content remains unavailable to automation.",
      input: quickEditSchema.extend(receiptFields),
      output: savedPlacement,
      example: {
        id: exampleId,
        locale: "en",
        expectedRevisionId: exampleId,
        expectedPlacementVersion: 0,
        title: "About",
        slug: "about",
        parentId: null,
        position: 0,
        requestId: exampleId,
      },
    },
    async (context, input) => {
      const values = quickEditSchema.strip().parse(input);
      return executeReceipt(
        context,
        "website_page_organize",
        input,
        savedPlacement,
        (tx) =>
          context.services.authorization.require(
            context.principal.actor,
            "cms.edit",
            tx,
          ),
        async (tx) => {
          // The domain adapter verifies this exact revision under its transaction lock.
          const detail = await context.services.cms.detail(
            context.principal.actor,
            input.id,
            input.locale,
            tx,
          );
          requireNonExecutableContent(detail.draft.data);
          return context.services.cms.workspace.quickEditDraft(
            context.principal.actor,
            values,
            tx,
          );
        },
      );
    },
  ),
  operation(
    {
      name: "website_pattern_create",
      method: "POST",
      path: "/website/patterns",
      scope: "website:organize",
      requiredScopes: ["website:write"],
      effect: "draft",
      description:
        "Create a requested reusable section from native block data. Returns a durable request receipt and saved revision. Does not publish the section or attach it to any page. CustomCode is unavailable.",
      input: patternSaveSchema.extend(receiptFields),
      output: savedPattern,
      example: {
        title: "Contact panel",
        locale: "en",
        data: { root: { props: {} }, content: [] },
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "website_pattern_create",
        input,
        savedPattern,
        (tx) =>
          context.services.authorization.require(
            context.principal.actor,
            "cms.edit",
            tx,
          ),
        (tx) => {
          requireNonExecutableContent(input.data);
          return context.services.cms.workspace.savePatternDraft(
            context.principal.actor,
            { title: input.title, locale: input.locale, data: input.data },
            tx,
          );
        },
      ),
  ),
];
