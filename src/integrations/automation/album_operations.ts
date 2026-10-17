import { z } from "zod";
import {
  albumDataSchema,
  albumListSchema,
  albumSaveSchema,
  albumVersionSchema,
} from "@/features/media/album_schemas";
import { operation } from "./operation";
import { executeReceipt, receiptFields } from "./receipt_service";
import { exampleId } from "./examples";

const album = z.strictObject({
  id: z.uuid(),
  version: z.int().positive(),
  draftRevisionId: z.uuid(),
  publishedRevisionId: z.uuid().nullable(),
  draft: albumDataSchema,
  published: albumDataSchema.nullable(),
  updatedAt: z.iso.datetime(),
  savedReferences: z.int().nonnegative(),
  publishedReferences: z.int().nonnegative(),
});
const summary = album
  .pick({
    id: true,
    version: true,
    draftRevisionId: true,
    publishedRevisionId: true,
    updatedAt: true,
  })
  .extend({
    title: z.string(),
    description: z.string(),
    imageCount: z.int().nonnegative(),
    coverAssetId: z.uuid().nullable(),
  });
const deleted = z.strictObject({ deletedId: z.uuid() });
const versionInput = albumVersionSchema.extend({
  id: z.uuid(),
  ...receiptFields,
});

export const albumOperations = [
  operation(
    {
      name: "albums_list",
      method: "GET",
      path: "/albums",
      scope: "albums:read",
      effect: "read",
      description:
        "Search saved native photo albums and their draft/published state. Linked galleries use a published album; copied galleries remain independent.",
      input: albumListSchema,
      output: z.strictObject({
        albums: z.array(summary),
        page: z.int().positive(),
        pageSize: z.int().positive(),
        total: z.int().nonnegative(),
      }),
      example: { page: 1, pageSize: 24 },
    },
    ({ services, principal }, input) =>
      services.albums.list(principal.actor, input),
  ),
  operation(
    {
      name: "albums_get",
      method: "GET",
      path: "/albums/{id}",
      scope: "albums:read",
      effect: "read",
      description:
        "Read album draft, published snapshot, version and retained references. Private image bytes need the separate image inspection grant.",
      input: z.strictObject({ id: z.uuid() }),
      output: album,
      example: { id: exampleId },
    },
    ({ services, principal }, { id }) =>
      services.albums.get(principal.actor, id),
  ),
  operation(
    {
      name: "albums_create",
      method: "POST",
      path: "/albums",
      scope: "albums:write",
      effect: "draft",
      description:
        "Create an editable private photo album with a stable requestId. Does not publish its images or any website placement.",
      input: z.strictObject({ data: albumDataSchema, ...receiptFields }),
      output: album,
      example: {
        requestId: exampleId,
        data: { title: "Club activities", items: [] },
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "albums_create",
        input,
        album,
        (tx) =>
          context.services.authorization.require(
            context.principal.actor,
            "media.manage",
            tx,
          ),
        (tx) =>
          context.services.albums.create(
            context.principal.actor,
            input.data,
            tx,
          ),
      ),
  ),
  operation(
    {
      name: "albums_save",
      method: "PATCH",
      path: "/albums/{id}",
      scope: "albums:write",
      effect: "draft",
      description:
        "Save an album draft using its current version. Published linked galleries retain the previous published album until explicitly published.",
      input: albumSaveSchema.extend({ id: z.uuid(), ...receiptFields }),
      output: album,
      example: {
        id: exampleId,
        expectedVersion: 1,
        requestId: exampleId,
        data: { title: "Club activities", items: [] },
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "albums_save",
        input,
        album,
        (tx) =>
          context.services.authorization.require(
            context.principal.actor,
            "media.manage",
            tx,
          ),
        (tx) =>
          context.services.albums.save(
            context.principal.actor,
            input.id,
            { expectedVersion: input.expectedVersion, data: input.data },
            tx,
          ),
      ),
  ),
  ...(["publish", "unpublish"] as const).map((action) =>
    operation(
      {
        name: `albums_${action}`,
        method: "POST",
        path: `/albums/{id}/${action}`,
        scope: action === "publish" ? "albums:publish" : "albums:manage",
        effect: action === "publish" ? "publish" : "archive",
        description:
          action === "publish"
            ? "Publish the exact requested album version. Every image must already be public. Linked published galleries update to this album revision; images and pages are never published implicitly."
            : "Unpublish the requested album only when no published content links to it. Retained drafts remain available.",
        input: versionInput.extend({ confirmed: z.literal(true) }),
        output: album,
        example: {
          id: exampleId,
          expectedVersion: 1,
          requestId: exampleId,
          confirmed: true,
        },
      },
      (context, input) =>
        executeReceipt(
          context,
          `albums_${action}`,
          input,
          album,
          async (tx) => {
            await context.services.authorization.require(
              context.principal.actor,
              "media.manage",
              tx,
            );
            await context.services.authorization.require(
              context.principal.actor,
              "cms.publish",
              tx,
            );
          },
          (tx) =>
            context.services.albums[action](
              context.principal.actor,
              input.id,
              { expectedVersion: input.expectedVersion },
              tx,
            ),
        ),
    ),
  ),
  operation(
    {
      name: "albums_delete",
      method: "POST",
      path: "/albums/{id}/delete",
      scope: "albums:manage",
      effect: "delete",
      description:
        "Permanently delete an explicitly requested unpublished, unreferenced album. The image files are retained. Referenced or published albums cannot be deleted.",
      input: versionInput.extend({ confirmed: z.literal(true) }),
      output: deleted,
      example: {
        id: exampleId,
        expectedVersion: 1,
        requestId: exampleId,
        confirmed: true,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "albums_delete",
        input,
        deleted,
        async (tx) => {
          context.services.authorization.requireRecent(context.principal.actor);
          await context.services.authorization.require(
            context.principal.actor,
            "media.manage",
            tx,
          );
        },
        (tx) =>
          context.services.albums.delete(
            context.principal.actor,
            input.id,
            { expectedVersion: input.expectedVersion },
            tx,
          ),
      ),
  ),
];
