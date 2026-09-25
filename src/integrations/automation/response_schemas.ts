import { z } from "zod";
import { organizationIdentitySchema } from "@/core/organization/organization_schemas";
import { featureKeySchema } from "@/core/features/feature_catalogue";
import {
  cmsKindSchema,
  cmsLocaleSchema,
  revisionInputSchema,
  siteSettingsSchema,
} from "@/features/cms/cms_schemas";
import { appearanceSchema } from "@/features/cms/appearance";
import { formDefinitionSchema, formKinds } from "@/features/forms/form_schemas";
import { eventFieldsSchema } from "@/features/events/event_schemas";
import { mediaMetadataSchema } from "@/features/media/media_schemas";
import { partnerProfileSchema } from "@/features/partners/partner_schemas";
import {
  calendarDefinitionSchema,
  calendarPageSchema,
  scheduleSchema,
} from "@/features/calendar/calendar_schemas";
import { automationScopeSchema } from "./scopes";

const id = z.uuid();
const instant = z.iso.datetime({ offset: true });
export const pageOutput = <T extends z.ZodType>(item: T) =>
  z.strictObject({
    items: z.array(item),
    nextOffset: z.int().nonnegative().nullable(),
  });
export const websiteContextOutput = z.strictObject({
  identity: organizationIdentitySchema.nullable(),
  site: z.strictObject({
    version: z.int().nonnegative(),
    draft: siteSettingsSchema,
    published: siteSettingsSchema.nullable(),
    previousAppearance: appearanceSchema.nullable(),
  }),
});
export const websiteSummaryOutput = z.strictObject({
  id,
  kind: cmsKindSchema,
  locale: cmsLocaleSchema,
  title: z.string(),
  slug: z.string(),
  draftRevisionId: id,
  publishedRevisionId: id.nullable(),
  archived: z.boolean(),
  updatedAt: instant,
  isHomepage: z.boolean(),
  kitId: z.enum(["rotary-service", "rotaract-action"]).optional(),
  demonstration: z.boolean().optional(),
  moduleKey: z.enum(["website", "gallery", "sponsors"]).nullable().optional(),
});
export const websiteDetailOutput = z.strictObject({
  id,
  kind: cmsKindSchema,
  locale: cmsLocaleSchema,
  draft: revisionInputSchema.extend({ id, createdAt: instant }),
  publishedRevisionId: id.nullable(),
  archived: z.boolean(),
  revisions: z.array(
    z.strictObject({ id, title: z.string(), createdAt: instant }),
  ),
  affectedPages: z.array(
    z.strictObject({
      id,
      title: z.string(),
      locale: cmsLocaleSchema,
      slug: z.string(),
    }),
  ),
  event: z
    .strictObject({
      id,
      slug: z.string(),
      title: z.string(),
      moduleKey: z.enum(["website", "gallery", "sponsors"]),
      canPublish: z.boolean(),
      readOnlyReason: z.string(),
    })
    .optional(),
});
export const referenceOutput = z.strictObject({
  sourceUrl: z.string(),
  trust: z.literal("untrusted-reference-content"),
  title: z.string().max(200),
  headings: z.array(z.string().max(250)).max(50),
  text: z.string().max(24000),
  links: z.array(z.string()).max(60),
  instructions: z.string(),
});
export const formOutput = z.strictObject({
  id,
  kind: z.enum(formKinds),
  archived: z.boolean(),
  draftRevision: z.int().positive(),
  draft: formDefinitionSchema,
  publishedVersionId: id.nullable(),
});
export const eventOutput = eventFieldsSchema.extend({
  id,
  slug: z.string(),
  version: z.int().positive(),
  archived: z.boolean(),
  cancelled: z.boolean(),
  published: z.boolean(),
});
export const mediaOutput = mediaMetadataSchema.extend({
  id,
  visibility: z.enum(["private", "public"]),
  mimeType: z.literal("image/webp"),
  originalName: z.string(),
  size: z.int().nonnegative(),
  width: z.int().positive(),
  height: z.int().positive(),
  createdAt: instant,
});
export const directoryOutput = z.strictObject({
  id,
  version: z.int().positive(),
  draft: partnerProfileSchema,
  published: partnerProfileSchema.nullable(),
  previous: partnerProfileSchema.nullable(),
  changed: z.boolean(),
  placements: z.array(
    z.strictObject({
      dynamic: z.boolean().optional(),
      id: id.nullable(),
      title: z.string(),
      locale: z.string().nullable(),
      eventId: id.nullable(),
    }),
  ),
});
export const calendarOutput = z.strictObject({
  calendars: z.array(
    z.strictObject({
      id,
      draft: calendarDefinitionSchema,
      published: calendarDefinitionSchema.nullable(),
      version: z.int().positive(),
      archived: z.boolean(),
    }),
  ),
  schedules: z.array(
    z.strictObject({
      id,
      calendarId: id,
      draft: scheduleSchema,
      published: scheduleSchema.nullable(),
      version: z.int().positive(),
      archived: z.boolean(),
    }),
  ),
  events: z.array(z.strictObject({ id, title: z.string() })),
  page: z.strictObject({
    draft: calendarPageSchema,
    published: calendarPageSchema.nullable(),
    version: z.int().nonnegative(),
  }),
});
// JSON Schema keywords are intentionally extensible; application DTOs above are closed.
export const jsonSchemaOutput = z
  .object({ type: z.literal("object") })
  .catchall(z.unknown());
export const operationDescriptionOutput = z.strictObject({
  name: z.string(),
  method: z.enum(["GET", "POST", "PATCH"]),
  path: z.string(),
  scope: automationScopeSchema.nullable(),
  description: z.string(),
  readOnly: z.boolean(),
  inputSchema: jsonSchemaOutput,
  outputSchema: jsonSchemaOutput,
  example: z.record(z.string(), z.unknown()),
});
export const capabilitiesOutput = z.strictObject({
  version: z.string(),
  publication: z.literal("manual-only"),
  sourceOrigins: z.array(z.string()),
  features: z.array(
    z.strictObject({
      key: featureKeySchema,
      enabled: z.boolean(),
      version: z.int().nonnegative(),
    }),
  ),
  operations: z.array(
    operationDescriptionOutput.omit({
      inputSchema: true,
      outputSchema: true,
      example: true,
    }),
  ),
});
