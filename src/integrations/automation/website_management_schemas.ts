import { z } from "zod";
import { expectedInput } from "@/features/cms/cms_commands";
import { publicationConfirmation } from "./publication_policy";
import {
  cmsKindSchema,
  cmsLocaleSchema,
  revisionInputSchema,
  siteSettingsSchema,
  slugSchema,
} from "@/features/cms/cms_schemas";

export const websiteCopyInput = expectedInput.extend({
  requestId: z
    .uuid()
    .describe("Reuse this UUID only for the exact same copy request."),
  title: z.string().trim().min(1).max(160),
  slug: slugSchema,
});

export const websiteSettingsInput = z.strictObject({
  locale: cmsLocaleSchema,
  expectedVersion: z.int().nonnegative(),
  settings: siteSettingsSchema,
});

export const websitePublishInput = expectedInput.extend({
  confirmed: publicationConfirmation,
});
export const websiteSettingsPublishInput = z.strictObject({
  locale: cmsLocaleSchema,
  expectedVersion: z.int().nonnegative(),
  scope: z
    .enum(["settings", "menu"])
    .describe(
      "settings activates all saved website settings including appearance; menu activates only homepage/menu selections, preserving published appearance. Neither publishes page drafts.",
    ),
  confirmed: publicationConfirmation,
});

export const websiteRevisionOutput = z.strictObject({
  id: z.uuid(),
  kind: cmsKindSchema,
  locale: cmsLocaleSchema,
  archived: z.boolean(),
  eventOwned: z.boolean(),
  draftRevisionId: z.uuid(),
  publishedRevisionId: z.uuid().nullable(),
  revision: revisionInputSchema.extend({
    id: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
  }),
});
