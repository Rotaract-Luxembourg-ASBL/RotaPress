import { z } from "zod";
import { eventFieldsSchema } from "@/features/events/event_schemas";
import { eventTemplateSelectionSchema } from "@/features/events/event_templates";
import { packageDraftSchema } from "@/features/events/package_schemas";
import { prizeDraftSchema } from "@/features/events/prize_schemas";
import { eventModuleKeySchema } from "@/features/events/event_modules";
import { eventOutput } from "./response_schemas";

export const eventPreparationInput = z.strictObject({
  event: eventFieldsSchema,
  template: eventTemplateSelectionSchema,
});
export const eventPreparationCreate = eventPreparationInput.extend({
  requestId: z.uuid(),
  reviewToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export const eventPreparationReview = z.strictObject({
  token: z.string(),
  source: z.string(),
  modules: z.array(
    z.strictObject({
      key: eventModuleKeySchema,
      state: z.enum(["enabled", "disabled", "suspended"]),
    }),
  ),
  pages: z.array(
    z.strictObject({
      title: z.string(),
      locale: z.string(),
      archived: z.boolean(),
    }),
  ),
  forms: z.array(
    z.strictObject({
      title: z.string(),
      kind: z.string(),
      archived: z.boolean(),
    }),
  ),
  packages: z.array(z.strictObject({ title: z.string() })),
  prizes: z.array(z.strictObject({ title: z.string() })),
  registration: z.strictObject({
    authority: z.enum(["none", "native"]),
    capacity: z.int().nullable(),
  }),
});
export const preparedEventOutput = z.strictObject({
  event: eventOutput,
  reviewUrl: z.string(),
  pages: z.array(
    z.strictObject({
      id: z.uuid(),
      title: z.string(),
      locale: z.string(),
      moduleKey: z.string().nullable(),
      reviewUrl: z.string(),
    }),
  ),
  forms: z.array(
    z.strictObject({
      id: z.uuid(),
      title: z.string(),
      kind: z.string(),
      draftRevision: z.int(),
      reviewUrl: z.string(),
    }),
  ),
});
export const packageItemOutput = z.strictObject({
  id: z.uuid(),
  version: z.int(),
  draft: packageDraftSchema,
  sourceId: z.uuid().nullable(),
  published: z.boolean(),
});
export const prizeItemOutput = z.strictObject({
  id: z.uuid(),
  version: z.int(),
  draft: prizeDraftSchema,
  published: z.boolean(),
});
export const eventContentWorkspaceOutput = z.strictObject({
  event: preparedEventOutput,
  modules: z.array(
    z.strictObject({
      key: eventModuleKeySchema,
      state: z.enum(["enabled", "disabled", "suspended"]),
      available: z.boolean(),
      reasons: z.array(z.string()),
    }),
  ),
  registration: z.strictObject({
    authority: z.enum(["none", "native", "luma"]),
    formId: z.uuid().nullable(),
    capacity: z.int().nullable(),
    open: z.boolean(),
    version: z.int(),
    externalLocked: z.boolean(),
  }),
  blockers: z.array(z.string()),
  publication: z.literal("manual-only"),
});
