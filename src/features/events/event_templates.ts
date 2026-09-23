import { z } from "zod";
import { createEventSchema } from "./event_schemas";
import {
  eventModules,
  eventModuleKeySchema,
  type EventModuleKey,
  type EventModuleState,
} from "./event_modules";

export const eventPresets = {
  simple: {
    label: "Simple Event",
    description: "A website for a meeting or gathering.",
    features: ["website"],
  },
  networking: {
    label: "Networking",
    description:
      "An event website and a free registration draft, initially closed.",
    features: ["website", "forms", "registration"],
  },
  fundraiser: {
    label: "Fundraiser",
    description:
      "A website, gallery, sponsors and enquiry form. No payments or draws.",
    features: ["website", "gallery", "sponsors", "forms"],
  },
} satisfies Record<
  string,
  { label: string; description: string; features: EventModuleKey[] }
>;
/** Presets create native registration; external providers are configured later. */
export function presetModuleDependencies(
  key: EventModuleKey,
): readonly EventModuleKey[] {
  return key === "registration"
    ? ["website", "forms"]
    : eventModules[key].dependencies;
}
const selectedModulesSchema = z
  .array(eventModuleKeySchema)
  .max(eventModuleKeySchema.options.length)
  .superRefine((keys, context) => {
    if (new Set(keys).size !== keys.length)
      context.addIssue({
        code: "custom",
        message: "Choose each event feature once.",
      });
    for (const key of keys) {
      const missing = presetModuleDependencies(key).filter(
        (dependency) => !keys.includes(dependency),
      );
      if (missing.length)
        context.addIssue({
          code: "custom",
          message: `${eventModules[key].label} requires ${missing.map((dependency) => eventModules[dependency].label).join(" and ")}.`,
        });
    }
  })
  .transform((keys) =>
    eventModuleKeySchema.options.filter((key) => keys.includes(key)),
  );
export const eventTemplateSelectionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("preset"),
    id: z.enum(["simple", "networking", "fundraiser"]),
    selectedModules: selectedModulesSchema.optional(),
  }),
  z.strictObject({ kind: z.literal("copy"), id: z.uuid() }),
]);
export const eventTemplateInputSchema = z.strictObject({
  event: createEventSchema,
  template: eventTemplateSelectionSchema,
});
export const eventTemplateCreateSchema = eventTemplateInputSchema.extend({
  requestId: z.uuid(),
  reviewToken: z.string().regex(/^[a-f0-9]{64}$/),
  confirmed: z.literal(true),
});
export type EventTemplateSelection = z.infer<
  typeof eventTemplateSelectionSchema
>;
export type EventTemplateReview = {
  token: string;
  source: string;
  modules: EventModuleState[];
  pages: { title: string; locale: string; archived: boolean }[];
  forms: { title: string; kind: string; archived: boolean }[];
  packages: { title: string }[];
  prizes: { title: string }[];
  registration: { authority: "none" | "native"; capacity: number | null };
};
export function presetModules(
  id: keyof typeof eventPresets,
  selectedModules?: readonly EventModuleKey[],
): EventModuleState[] {
  const features: readonly EventModuleKey[] =
    selectedModules ?? eventPresets[id].features;
  return (Object.keys(eventModules) as EventModuleKey[]).map((key) => ({
    key,
    state: features.includes(key) ? "enabled" : "disabled",
  }));
}
