import { z } from "zod";
import { clubDetailKeySchema } from "./club_details";
import { siteSeoSchema } from "./site_seo";
import { appearanceSchema, type Appearance } from "./appearance";
import {
  defaultWebsiteBranding,
  websiteBrandingSchema,
  type WebsiteBranding,
} from "./website_branding";
import {
  text,
  shortText,
  assetId,
  aspectRatio,
  link,
  block,
  featureIcon,
} from "./block_fields";
import { sectionBlockSchemas } from "./section_schemas";
import { eventContentBlockSchemas } from "../events/event_content";
import { websiteTemplateSetupSchema } from "./website_setup_schemas";
import type { KitId } from "./kits/catalogue";
import type { PublicPartner } from "../partners/partner_schemas";
import {
  eventDesignSchema,
  eventHiddenSectionsSchema,
} from "../events/event_design";
export { isSafeLink } from "../../core/safe-link";

export const cmsLocaleSchema = z.enum(["en", "fr", "lb"]);
export type CmsLocale = z.infer<typeof cmsLocaleSchema>;
export const cmsKindSchema = z.enum(["page", "section", "header", "footer"]);
export type CmsKind = z.infer<typeof cmsKindSchema>;
export function isSitePart(kind: CmsKind): kind is "header" | "footer" {
  return kind === "header" || kind === "footer";
}
const leafBlockSchemas = [
  block("ClubDetails", {
    title: shortText,
    fields: z
      .array(z.strictObject({ field: clubDetailKeySchema }))
      .min(1)
      .max(19)
      .refine(
        (items) =>
          new Set(items.map((item) => item.field)).size === items.length,
        "Choose each club detail once.",
      ),
    layout: z.enum(["list", "columns"]),
    showLabels: z.boolean(),
  }),
  block("CustomCode", {
    title: z.string().trim().min(1).max(160),
    html: z.string().max(30_000),
    css: z.string().max(15_000),
    javascript: z.string().max(30_000),
    height: z.number().int().min(80).max(1600),
  }),
  block("Calendar", {
    title: shortText,
    calendarIds: z.array(z.uuid()).max(30),
    view: z.enum(["month", "week", "agenda"]),
    timezone: z
      .string()
      .max(80)
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid time zone."),
  }),
  ...sectionBlockSchemas,
  ...eventContentBlockSchemas,
  block("Hero", {
    title: shortText,
    body: text,
    buttonLabel: shortText,
    buttonHref: link,
    assetId: assetId.optional(),
    imageAlt: shortText.optional(),
    imagePosition: z.enum(["left", "right"]).optional(),
  }),
  block("RichText", { text: z.string().max(30_000) }),
  block("Form", { formId: z.union([z.uuid(), z.literal("")]) }),
  block("EventRegistration", {}),
  block("Heading", { text: shortText, level: z.enum(["h2", "h3"]) }),
  block("Button", {
    label: shortText,
    href: link,
    style: z.enum(["accent", "outline"]),
    alignment: z.enum(["left", "center", "right"]),
  }),
  block("Divider", { width: z.enum(["full", "narrow"]) }),
  block("Spacer", { size: z.enum(["small", "medium", "large"]) }),
  block("Cover", {
    title: shortText,
    body: text,
    buttonLabel: shortText,
    buttonHref: link,
    assetId: assetId.optional(),
    tone: z.enum(["paper", "sage", "ink"]),
    padding: z.enum(["small", "medium", "large"]),
    alignment: z.enum(["left", "center"]),
  }),
  block("Image", {
    assetId,
    alt: shortText,
    caption: shortText,
    alignment: z.enum(["left", "center", "right"]).optional(),
    width: z.enum(["full", "wide", "medium", "small"]).optional(),
    widthPx: z.number().int().min(0).max(2400).optional(),
    focalX: z.number().int().min(0).max(100).optional(),
    focalY: z.number().int().min(0).max(100).optional(),
    flipHorizontal: z.boolean().optional(),
    flipVertical: z.boolean().optional(),
    aspectRatio: aspectRatio.optional(),
    fit: z.enum(["cover", "contain"]).optional(),
    corners: z.enum(["square", "soft", "round"]).optional(),
    href: link.optional(),
  }),
  block("Gallery", {
    items: z
      .array(
        z.strictObject({
          assetId,
          alt: shortText,
          caption: shortText.optional(),
        }),
      )
      .max(30),
    columns: z.enum(["two", "three", "four"]).optional(),
    aspectRatio: aspectRatio.optional(),
  }),
  block("ImageSlider", {
    items: z
      .array(
        z.strictObject({
          assetId,
          alt: shortText,
          caption: shortText,
          focalX: z.number().int().min(0).max(100).optional(),
          focalY: z.number().int().min(0).max(100).optional(),
        }),
      )
      .max(12),
    aspectRatio: aspectRatio.optional(),
  }),
  block("Cards", {
    items: z
      .array(
        z.strictObject({
          title: shortText,
          text,
          href: link,
          assetId: assetId.optional(),
          alt: shortText.optional(),
          icon: featureIcon.optional(),
          linkLabel: shortText.optional(),
        }),
      )
      .max(20),
  }),
  block("Statistics", {
    items: z
      .array(z.strictObject({ value: shortText, label: shortText }))
      .max(12),
  }),
  block("CallToAction", {
    title: shortText,
    text,
    label: shortText,
    href: link,
  }),
  block("FAQ", {
    items: z
      .array(z.strictObject({ question: shortText, answer: text }))
      .max(30),
  }),
  block("Team", {
    items: z
      .array(z.strictObject({ name: shortText, role: shortText, assetId }))
      .max(40),
  }),
  block("Sponsors", {
    items: z
      .array(z.strictObject({ name: shortText, href: link, assetId }))
      .max(40),
  }),
  block("PartnerCollection", {
    title: shortText,
    selectionMode: z.enum(["selected", "category"]).optional(),
    category: z.enum(["all", "partner", "sponsor", "team"]).optional(),
    partnerIds: z
      .array(z.uuid())
      .max(40)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Select each partner once.",
      ),
    presentation: z.enum(["logos", "cards"]),
  }),
  block("SharedSection", { sectionId: z.uuid() }),
  block("SiteBrand", {
    assetId,
    templateBrand: z.enum(["rotary", "rotaract"]).optional(),
    alt: shortText,
    label: shortText,
    logoSize: z.enum(["small", "medium", "large"]),
    showName: z.boolean(),
  }),
  block("SiteMenu", {
    menuKey: z.literal("primary"),
    label: shortText,
    layout: z.enum(["horizontal", "vertical"]),
  }),
  block("SiteContact", {
    title: shortText,
    email: z.union([z.email(), z.literal("")]),
    phone: z
      .string()
      .max(60)
      .regex(/^[+0-9() .-]*$/),
    address: z.string().max(1000),
  }),
  block("SiteSocial", { label: shortText }),
  block("SiteFooterText", {}),
] as const;
export const cmsLeafBlockSchema = z.discriminatedUnion(
  "type",
  leafBlockSchemas,
);
export const cmsBlockSchema = z.discriminatedUnion("type", [
  ...leafBlockSchemas,
  block("Columns", {
    ratio: z.enum(["balanced", "wide-left", "wide-right"]),
    left: z.array(cmsLeafBlockSchema).max(12),
    right: z.array(cmsLeafBlockSchema).max(12),
  }),
  block("SiteRow", {
    sticky: z.boolean().optional(),
    layout: z.enum(["balanced", "wide-left", "wide-center", "wide-right"]),
    flow: z.enum(["row", "columns"]),
    spacing: z.enum(["compact", "comfortable"]),
    left: z.array(cmsLeafBlockSchema).max(12),
    center: z.array(cmsLeafBlockSchema).max(12),
    right: z.array(cmsLeafBlockSchema).max(12),
  }),
]);
export const sitePartBlockTypes = [
  "ClubDetails",
  "SiteRow",
  "SiteBrand",
  "SiteMenu",
  "SiteContact",
  "SiteSocial",
  "SiteFooterText",
  "Button",
  "Heading",
  "RichText",
] as const;
export function flattenBlocks(content: Block[]): Block[] {
  return content.flatMap((item) =>
    item.type === "SiteRow" || item.type === "Columns"
      ? [
          item,
          ...item.props.left,
          ...(item.type === "SiteRow" ? item.props.center : []),
          ...item.props.right,
        ]
      : [item],
  );
}

export const cmsDataSchema = z
  .strictObject({
    root: z.strictObject({
      props: z.strictObject({
        kit: z.enum(["rotary-service", "rotaract-action"]).optional(),
        demonstration: z.boolean().optional(),
        eventLayout: z.enum(["club", "standalone"]).optional(),
        eventDesign: eventDesignSchema.optional(),
        eventHiddenSections: eventHiddenSectionsSchema.optional(),
      }),
    }),
    content: z.array(cmsBlockSchema).max(80),
    zones: z.strictObject({}).optional(),
  })
  .superRefine((value, context) => {
    const ids = flattenBlocks(value.content).map((item) => item.props.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Each block needs a unique identifier.",
        path: ["content"],
      });
    }
    if (ids.length > 120)
      context.addIssue({
        code: "custom",
        message: "Use at most 120 blocks including layout content.",
        path: ["content"],
      });
  });

export type Block = z.infer<typeof cmsBlockSchema>;
export type CmsData = z.infer<typeof cmsDataSchema>;
export const emptyCmsData: CmsData = { root: { props: {} }, content: [] };
export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, digits and hyphens.",
  );
export const revisionInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  slug: slugSchema,
  description: z.string().max(300),
  socialImageId: z.uuid().nullable(),
  data: cmsDataSchema,
});

export const siteSettingsSchema = z
  .strictObject({
    seo: siteSeoSchema.optional(),
    branding: websiteBrandingSchema.default(defaultWebsiteBranding),
    templateSetup: websiteTemplateSetupSchema.optional(),
    headerId: z.uuid().nullable().optional(),
    footerId: z.uuid().nullable().optional(),
    homePageId: z.uuid().nullable(),
    eventsPageId: z.uuid().nullable().optional(),
    contactFormId: z.uuid().nullable().optional(),
    navigation: z
      .array(
        z.union([
          z.strictObject({
            pageId: z.uuid(),
            label: z.string().trim().min(1).max(60),
          }),
          z.strictObject({
            systemPage: z.enum(["events", "calendar"]),
            label: z.string().trim().min(1).max(60),
          }),
        ]),
      )
      .max(12),
    footerText: z.string().max(1_000),
    socialLinks: z
      .array(
        z.strictObject({ label: z.string().trim().min(1).max(60), href: link }),
      )
      .max(8),
    ...appearanceSchema.shape,
  })
  .refine(
    (settings) =>
      !settings.eventsPageId || settings.eventsPageId !== settings.homePageId,
    {
      message:
        "Choose different pages for the homepage and Events landing page.",
      path: ["eventsPageId"],
    },
  );
export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export const defaultSiteSettings: SiteSettings = {
  branding: defaultWebsiteBranding,
  homePageId: null,
  navigation: [],
  footerText: "",
  socialLinks: [],
  themeId: "default",
  accentColor: null,
  font: null,
};

export type RevisionDto = z.infer<typeof revisionInputSchema> & {
  id: string;
  createdAt: string;
};
export type CmsSummary = {
  kitId?: KitId;
  demonstration?: boolean;
  moduleKey?: "website" | "gallery" | "sponsors" | null;
  id: string;
  kind: CmsKind;
  locale: CmsLocale;
  title: string;
  slug: string;
  draftRevisionId: string;
  publishedRevisionId: string | null;
  archived: boolean;
  updatedAt: string;
  isHomepage: boolean;
};
export type AffectedPage = {
  id: string;
  title: string;
  locale: CmsLocale;
  slug: string;
};
export type CmsDetail = {
  event?: {
    id: string;
    slug: string;
    title: string;
    moduleKey: "website" | "gallery" | "sponsors";
    canPublish: boolean;
    readOnlyReason: string;
  };
  id: string;
  kind: CmsKind;
  locale: CmsLocale;
  draft: RevisionDto;
  publishedRevisionId: string | null;
  archived: boolean;
  revisions: { id: string; title: string; createdAt: string }[];
  affectedPages: AffectedPage[];
};
export type PublicPage = {
  revisionId?: string;
  kind: CmsKind;
  id: string;
  title: string;
  slug: string;
  locale: CmsLocale;
  description: string;
  socialImageId: string | null;
  data: CmsData;
  sections: Record<string, CmsData>;
  partners?: Record<string, PublicPartner>;
};
export type PublicSite = Appearance & {
  eventsPageId?: string | null;
  seo?: z.infer<typeof siteSeoSchema>;
  branding?: WebsiteBranding;
  homeHref?: string;
  navigation: { label: string; href: string }[];
  footerText: string;
  socialLinks: SiteSettings["socialLinks"];
  header: CmsData | null;
  footer: CmsData | null;
};
export type SiteDraft = {
  version: number;
  draft: SiteSettings;
  published: SiteSettings | null;
  previousAppearance: Appearance | null;
};
