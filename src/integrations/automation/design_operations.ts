import { z } from "zod";
import {
  cmsBlockSchema,
  cmsDataSchema,
  cmsKindSchema,
  cmsLocaleSchema,
  emptyCmsData,
  sitePartBlockTypes,
} from "@/features/cms/cms_schemas";
import {
  pageTemplateIdSchema,
  starterPages,
} from "@/features/cms/page_templates";
import {
  kitIdSchema,
  kitRecipes,
  kits,
  recipeIdSchema,
} from "@/features/cms/kits/catalogue";
import { templateImages } from "@/features/cms/kits/template_images";
import {
  eventBlockTypes,
  eventPageModuleKeySchema,
} from "@/features/events/event_modules";
import { eventOnlyBlockTypes } from "@/features/events/event_content";
import {
  eventLayoutIdSchema,
  eventLayouts,
} from "@/features/events/event_layouts";
import { inputJsonSchema, operation } from "./operation";

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Derive the native schema once, removing executable branches even in nested layouts. */
function automationDataSchema() {
  const schema = inputJsonSchema(cmsDataSchema);
  const resolve = (value: unknown): unknown => {
    const seen = new Set<string>();
    while (
      object(value) &&
      typeof value.$ref === "string" &&
      value.$ref.startsWith("#/")
    ) {
      const reference = value.$ref;
      if (seen.has(reference)) return value;
      seen.add(reference);
      value = reference
        .slice(2)
        .split("/")
        .reduce<unknown>(
          (node, key) =>
            object(node)
              ? node[key.replaceAll("~1", "/").replaceAll("~0", "~")]
              : undefined,
          schema,
        );
    }
    return value;
  };
  const forbidden = (node: unknown) => {
    const value = resolve(node);
    const properties = object(value) ? resolve(value.properties) : null;
    const type = object(properties) ? resolve(properties.type) : null;
    return object(type) && type.const === "CustomCode";
  };
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value))
      return value.filter((item) => !forbidden(item)).map(clean);
    if (!object(value)) return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => !forbidden(item))
        .map(([key, item]) => [key, clean(item)]),
    );
  };
  return z.record(z.string(), z.unknown()).parse(clean(schema));
}

const dataSchema = automationDataSchema();
const blockTypes = cmsBlockSchema.options
  .map((schema) => schema.shape.type.value)
  .filter((type) => type !== "CustomCode");
const contextSchema = z.strictObject({
  id: z.string(),
  kind: cmsKindSchema,
  eventModule: eventPageModuleKeySchema.nullable(),
  allowedBlockTypes: z.array(z.string()),
  rules: z.array(z.string()),
});
const designOutput = z.strictObject({
  schemaVersion: z.literal(1),
  locales: z.array(cmsLocaleSchema),
  contentKinds: z.array(cmsKindSchema),
  dataSchema: z.record(z.string(), z.unknown()),
  emptyDocument: z.strictObject({
    root: z.strictObject({ props: z.strictObject({}) }),
    content: z.array(z.never()),
  }),
  contexts: z.array(contextSchema),
  pageTemplates: z.array(
    z.strictObject({
      id: pageTemplateIdSchema,
      name: z.string(),
      description: z.string(),
      contexts: z.array(z.string()),
    }),
  ),
  websiteKits: z.array(
    z.strictObject({
      id: kitIdSchema,
      name: z.string(),
      description: z.string(),
      recipes: z.array(recipeIdSchema),
    }),
  ),
  eventLayouts: z.array(
    z.strictObject({
      id: eventLayoutIdSchema,
      templateId: pageTemplateIdSchema,
      name: z.string(),
      description: z.string(),
      sections: z.array(z.string()),
      context: z.literal("event:website"),
    }),
  ),
  bundledImages: z.array(
    z.strictObject({ id: z.string(), title: z.string(), alt: z.string() }),
  ),
  rules: z.array(z.string()),
});

function contentContexts(): z.infer<typeof contextSchema>[] {
  const pageBlocks = blockTypes.filter(
    (type) =>
      !type.startsWith("Site") &&
      !eventOnlyBlockTypes.some((eventType) => eventType === type),
  );
  return [
    {
      id: "page",
      kind: "page",
      eventModule: null,
      allowedBlockTypes: pageBlocks,
      rules: [
        "Club pages cannot contain event-only blocks, eventDesign, eventHiddenSections or standalone event layout.",
      ],
    },
    {
      id: "section",
      kind: "section",
      eventModule: null,
      allowedBlockTypes: pageBlocks.filter((type) => type !== "SharedSection"),
      rules: ["Reusable sections cannot reference other shared sections."],
    },
    ...(["header", "footer"] as const).map((kind) => ({
      id: kind,
      kind,
      eventModule: null,
      allowedBlockTypes: [...sitePartBlockTypes],
      rules: [
        "Every nested child must also belong to this shared-part allowlist. Create with the blank template to receive the native starter.",
      ],
    })),
    ...eventPageModuleKeySchema.options.map((eventModule) => ({
      id: `event:${eventModule}`,
      kind: "page" as const,
      eventModule,
      allowedBlockTypes: [...eventBlockTypes[eventModule]],
      rules: [
        "Creation needs event.id and event.moduleKey, current event access and an enabled page module.",
        "Only one active page per event module; add languages to the existing content instead of creating another page.",
        "Private images may be attached to event drafts only with current club media authority. Event-only editors can use public images. Publication always requires an explicit public visibility decision.",
      ],
    })),
  ];
}

function templateContexts(id: string) {
  if (id === "blank") return contentContexts().map((context) => context.id);
  if (id === "event-reference" || id.startsWith("event-layout:"))
    return ["event:website"];
  if (id.endsWith(":event-detail")) return ["page", "event:website"];
  return ["page"];
}

export function websiteDesign() {
  const basicIds = pageTemplateIdSchema.options.flatMap((option) =>
    option instanceof z.ZodEnum ? option.options : [],
  );
  const basic = basicIds.map((id) => ({
    id: pageTemplateIdSchema.parse(id),
    name:
      starterPages.find((page) => page.slug === id)?.title ??
      (id === "event-reference"
        ? "Rotaract signature event"
        : id === "community"
          ? "Community"
          : "Blank"),
    description:
      id === "blank"
        ? "Start editable native content; shared parts receive their native starter."
        : id === "event-reference"
          ? "Native event introduction, programme and practical details; requires an event Website."
          : "Editable starter copy. Replace example text with verified club facts.",
    contexts: templateContexts(id),
  }));
  const recipes = kitIdSchema.options.flatMap((kitId) =>
    kitRecipes
      .filter((recipe) => recipe.id !== "header" && recipe.id !== "footer")
      .map((recipe) => {
        const id = pageTemplateIdSchema.parse(`${kitId}:${recipe.id}`);
        return {
          id,
          name: `${kits[kitId].name}: ${recipe.name}`,
          description: recipe.description,
          contexts: templateContexts(id),
        };
      }),
  );
  const layouts = eventLayouts.map((layout) => ({
    id: layout.id,
    templateId: pageTemplateIdSchema.parse(`event-layout:${layout.id}`),
    name: layout.name,
    description: layout.description,
    sections: [...layout.sections],
    context: "event:website" as const,
  }));
  return {
    schemaVersion: 1 as const,
    locales: [...cmsLocaleSchema.options],
    contentKinds: [...cmsKindSchema.options],
    dataSchema: structuredClone(dataSchema),
    emptyDocument: structuredClone(emptyCmsData),
    contexts: contentContexts(),
    pageTemplates: [
      ...basic,
      ...recipes,
      ...layouts.map((layout) => ({
        id: layout.templateId,
        name: layout.name,
        description: layout.description,
        contexts: [layout.context],
      })),
    ],
    websiteKits: kitIdSchema.options.map((id) => ({
      id,
      name: kits[id].name,
      description: kits[id].description,
      recipes: [...kits[id].websiteRecipes],
    })),
    eventLayouts: layouts,
    bundledImages: Object.entries(templateImages).map(([id, value]) => ({
      id,
      title: value.title,
      alt: value.alt,
    })),
    rules: [
      "dataSchema describes the website_save data field, not the complete save request. Read website_get and retain expectedRevisionId when saving.",
      "Use the matching context allowlist for every block, including layout children. Unique props.id and version 1 are required. Maximum 80 top-level and 120 total blocks; nested layouts cannot nest again.",
      "JSON Schema cannot express every domain rule. The server also validates links, sanitizes RichText, validates dates/time zones, checks references, permissions and enabled features.",
      "The schema is a content/layout vocabulary, not permission to use a feature. Discover actual connection grants and feature states with automation_capabilities.",
      "Event layouts require an event Website and do not create registrations, payments or guest access. Use the event tools and reference real records.",
      "Copying a page template creates editable example content; it does not install a website kit or activate its theme. Preserve current branding from website_context.",
      "Shared sections and connected forms, directory profiles, calendars and event collections use domain records and publication rules. Never invent reference IDs or achievements.",
      "Custom HTML/JavaScript is unavailable to automation. Publication, image visibility and real delivery remain deliberate human actions.",
      "After saving, use website_preview on desktop and phone, inspect images and follow nextOffsetY. Screenshots do not validate inactive interactive blocks.",
    ],
  };
}

export const designOperations = [
  operation(
    {
      name: "website_design",
      method: "GET",
      path: "/website/design",
      scope: "website:read",
      description:
        "Discover the native page/block JSON Schema, allowed block contexts, copy-only templates, event layouts and locale rules before designing. Executable CustomCode is excluded. Event layouts require an event Website; templates never activate features or publish content.",
      input: z.strictObject({}),
      output: designOutput,
      example: {},
    },
    async () => websiteDesign(),
  ),
];
