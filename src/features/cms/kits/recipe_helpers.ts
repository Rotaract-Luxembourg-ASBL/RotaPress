import { cmsBlockSchema, type Block, type CmsData } from "../cms_schemas";
import type { KitId, RecipeId } from "./catalogue";

export type RecipeContext = {
  kit: KitId;
  demo?: boolean;
  assets?: string[];
  links?: Partial<Record<RecipeId, string>>;
  projectIds?: string[];
  contactFormId?: string;
  membershipFormId?: string;
  timezone?: string;
  calendarEnabled?: boolean;
};
export function block<T extends Block["type"]>(
  type: T,
  props: Omit<Extract<Block, { type: T }>["props"], "id" | "version">,
): Extract<Block, { type: T }>;
export function block(type: Block["type"], props: object): Block {
  return cmsBlockSchema.parse({
    type,
    props: { id: crypto.randomUUID(), version: 1, ...props },
  });
}
export function document(context: RecipeContext, content: Block[]): CmsData {
  return {
    root: {
      props: {
        kit: context.kit,
        ...(context.demo ? { demonstration: true } : {}),
      },
    },
    content,
  };
}
export const photo = (context: RecipeContext, index = 0) =>
  context.assets?.[index % (context.assets.length || 1)] ?? "";
export const intro = (
  title: string,
  introduction: string,
  eyebrow = "",
  centered = false,
) =>
  block("PageIntro", {
    title,
    introduction,
    eyebrow,
    alignment: centered ? "center" : "left",
  });
export const heading = (text: string) =>
  block("Heading", { text, level: "h2" });
export const text = (html: string) =>
  block("RichText", { text: html, design: { width: "reading" } });
export const linkButton = (label: string, href: string, outline = false) =>
  block("Button", {
    label,
    href,
    style: outline ? "outline" : "accent",
    alignment: "left",
  });
export const collection = (
  context: RecipeContext,
  title: string,
  emptyText = "",
) =>
  block("PageCollection", {
    title,
    introduction: "",
    pageIds: context.projectIds ?? [],
    layout: "cards",
    emptyText,
  });
export const events = (title: string, limit = 2) =>
  block("EventCollection", {
    title,
    introduction: "",
    period: "upcoming",
    limit,
    layout: "cards",
  });
export const calendar = (
  context: RecipeContext,
  title = "Plan your next visit",
  view: "agenda" | "month" = "agenda",
): Block[] =>
  context.calendarEnabled === false
    ? []
    : [
        block("Calendar", {
          title,
          calendarIds: [],
          view,
          timezone: context.timezone ?? "UTC",
        }),
      ];
export const directory = (
  title: string,
  category: "partner" | "sponsor" | "team",
) =>
  block("PartnerCollection", {
    title,
    partnerIds: [],
    selectionMode: "category",
    category,
    presentation: category === "team" ? "cards" : "logos",
  });
export const invitation = (context: RecipeContext) =>
  block("CallToAction", {
    title:
      context.kit === "rotary-service"
        ? "Make room for something meaningful."
        : "Your next chapter starts with people.",
    text: "Bring your curiosity, your ideas and your willingness to take part. Start with a conversation.",
    label: "Get to know us",
    href: context.links?.join || "/membership",
  });
export const gallery = (context: RecipeContext) =>
  block("Gallery", {
    columns: "three",
    aspectRatio: "landscape",
    items: (context.assets ?? []).map((assetId, index) => ({
      assetId,
      alt: [
        "A garden with raised growing beds",
        "Young plants growing in soil",
        "Herbs growing in bamboo containers",
      ][index % 3],
      caption: "",
    })),
  });
