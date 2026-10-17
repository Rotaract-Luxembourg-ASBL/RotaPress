import { z } from "zod";
import { DomainError } from "@/core/DomainError";
import {
  mediaBatchDeleteSchema,
  mediaMetadataSchema,
} from "@/features/media/media_schemas";
import { mediaMetadataRevision } from "@/features/media/media_automation";
import { operation } from "./operation";
import { executeReceipt, receiptFields } from "./receipt_service";
import { receiptOperation } from "./receipt_operation";
import { requireReceiptCapability } from "./receipt_authority";
import { mediaOutput } from "./response_schemas";
import { fileAsset } from "./file_operations";
import { exampleId } from "./examples";

const metadataInput = mediaMetadataSchema.extend({
  id: z.uuid(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
});
const targets = mediaBatchDeleteSchema.shape.assets;
const families = [
  {
    prefix: "media",
    scope: "media:manage",
    kinds: ["image"],
    schema: mediaOutput,
  },
  {
    prefix: "files",
    scope: "files:manage",
    kinds: ["document", "audio", "video"],
    schema: fileAsset,
  },
] as const;

export const mediaManagementOperations = families.flatMap(
  ({ prefix, scope, kinds, schema }) => {
    const detail = z.strictObject({
      asset: schema,
      metadataRevision: z.string().length(64),
    });
    const batch = z.strictObject({ items: z.array(detail) });
    const deleted = z.strictObject({ deletedIds: z.array(z.uuid()) });
    const value = (asset: z.infer<typeof schema>) => ({
      asset,
      metadataRevision: mediaMetadataRevision(asset),
    });
    return [
      receiptOperation(
        {
          name: `${prefix}_details_save`,
          method: "PATCH",
          path: `/${prefix}/{id}/details`,
          scope,
          effect: "update",
          description:
            "Save the exact requested metadata, including public metadata, with its current fingerprint. Visibility and file bytes remain unchanged. Preserve fields the user did not request to change.",
          input: metadataInput,
          output: detail,
          example: {
            id: exampleId,
            expectedRevision: "0".repeat(64),
            title: "Club activity",
            alt: "Volunteers at the club",
            caption: "",
            tags: [],
            collection: "",
          },
        },
        requireReceiptCapability("media.manage"),
        async ({ services, principal }, input, tx) => {
          const current = await services.media.detail(
            principal.actor,
            input.id,
            tx,
          );
          if (!(kinds as readonly string[]).includes(current.kind))
            throw new DomainError(
              "MEDIA_KIND_REQUIRED",
              "This permission does not include this file type.",
              403,
            );
          return value(
            schema.parse(
              await services.media.update(
                principal.actor,
                { ...input, visibility: current.visibility },
                tx,
              ),
            ),
          );
        },
      ),
      receiptOperation(
        {
          name: `${prefix}_organize`,
          method: "POST",
          path: `/${prefix}/organize`,
          scope,
          effect: "update",
          description:
            "Apply requested collection or tags to the exact selected files atomically. Every current fingerprint must match; unrelated metadata is preserved.",
          input: z
            .strictObject({
              assets: targets,
              collection: z.string().max(80).optional(),
              tags: z.array(z.string().min(1).max(40)).max(12).optional(),
            })
            .refine(
              (input) =>
                input.collection !== undefined || input.tags !== undefined,
              "Choose a collection or tags.",
            ),
          output: batch,
          example: {
            assets: [{ id: exampleId, expectedRevision: "0".repeat(64) }],
            collection: "Club activities",
          },
        },
        requireReceiptCapability("media.manage"),
        async ({ services, principal }, input, tx) => ({
          items: (
            await services.media.updateBatch(principal.actor, input, tx, kinds)
          ).map((asset) => value(schema.parse(asset))),
        }),
      ),
      receiptOperation(
        {
          name: `${prefix}_hide`,
          method: "POST",
          path: `/${prefix}/hide`,
          scope,
          effect: "archive",
          description:
            "Make the explicitly requested files private in one atomic batch. Published references block the entire change. Does not remove saved history or hide any other file.",
          input: z.strictObject({
            assets: targets,
            confirmed: z.literal(true),
          }),
          output: batch,
          example: {
            assets: [{ id: exampleId, expectedRevision: "0".repeat(64) }],
            confirmed: true,
          },
        },
        requireReceiptCapability("media.manage"),
        async ({ services, principal }, input, tx) => ({
          items: (
            await services.media.updateBatch(
              principal.actor,
              { assets: input.assets, visibility: "private" },
              tx,
              kinds,
            )
          ).map((asset) => value(schema.parse(asset))),
        }),
      ),
      operation(
        {
          name: `${prefix}_delete`,
          method: "POST",
          path: `/${prefix}/delete`,
          scope,
          effect: "delete",
          description:
            "Permanently delete the exact requested files at current fingerprints. Any retained page, album or revision reference blocks the whole batch. Recent authentication is required. Reuse requestId on interruption; the original deletion receipt is returned.",
          input: z.strictObject({
            assets: targets,
            confirmed: z.literal(true),
            ...receiptFields,
          }),
          output: deleted,
          example: {
            assets: [{ id: exampleId, expectedRevision: "0".repeat(64) }],
            confirmed: true,
            requestId: exampleId,
          },
        },
        async (context, input) => {
          let storageKeys: string[] = [];
          try {
            return await executeReceipt(
              context,
              `${prefix}_delete`,
              input,
              deleted,
              async (tx) => {
                context.services.authorization.requireRecent(
                  context.principal.actor,
                );
                await context.services.authorization.require(
                  context.principal.actor,
                  "media.manage",
                  tx,
                );
              },
              async (tx) => {
                const removed =
                  await context.services.media.deleteBatchInTransaction(
                    context.principal.actor,
                    { assets: input.assets },
                    tx,
                    kinds,
                  );
                storageKeys = removed.storageKeys;
                return { deletedIds: removed.ids };
              },
            );
          } finally {
            // A rollback keeps referenced files. A lost response still reclaims committed deletions.
            await context.services.media.cleanupDeleted(storageKeys);
          }
        },
      ),
    ];
  },
);
