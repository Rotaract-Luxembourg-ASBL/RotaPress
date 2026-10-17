import { z } from "zod";
import { DomainError } from "@/core/DomainError";
import {
  mediaUsagePageSchema,
  mediaUsageQuerySchema,
} from "@/features/media/media_usage";
import { operation } from "./operation";
import { exampleId } from "./examples";

export const mediaUsageOperations = (
  [
    { prefix: "media", scope: "media:read", kinds: ["image"] },
    {
      prefix: "files",
      scope: "files:read",
      kinds: ["document", "audio", "video"],
    },
  ] as const
).map(({ prefix, scope, kinds }) =>
  operation(
    {
      name: `${prefix}_usage`,
      effect: "read",
      method: "GET",
      path: `/${prefix}/{id}/usage`,
      scope,
      description:
        "Read complete protected reference counts and a paginated list of destinations. Destination titles and totals additionally require their albums:read, website:read, events:read, projects:read or directory:read grant and current resource access. Retained revisions are grouped by destination; no file bytes are returned.",
      input: mediaUsageQuerySchema.extend({ id: z.uuid() }),
      output: mediaUsagePageSchema,
      example: { id: exampleId, page: 1, pageSize: 20 },
    },
    async ({ services, principal }, { id, ...input }) => {
      const { asset, ...result } = await services.media.usage(
        principal.actor,
        id,
        input,
        {
          albums: principal.scopes.includes("albums:read"),
          website: principal.scopes.includes("website:read"),
          events: principal.scopes.includes("events:read"),
          projects: principal.scopes.includes("projects:read"),
          directory: principal.scopes.includes("directory:read"),
        },
      );
      if (!(kinds as readonly string[]).includes(asset.kind))
        throw new DomainError(
          "MEDIA_KIND_REQUIRED",
          "This permission does not include this file type.",
          403,
        );
      return result;
    },
  ),
);
