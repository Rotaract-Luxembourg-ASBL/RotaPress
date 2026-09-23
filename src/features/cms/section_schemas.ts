import { z } from "zod";
import {
  assetId,
  block,
  featureIcon,
  link,
  shortText,
  text,
} from "./block_fields";

export const sectionBlockSchemas = [
  block("PageIntro", {
    eyebrow: shortText,
    title: shortText,
    introduction: text,
    alignment: z.enum(["left", "center"]),
  }),
  block("PageCollection", {
    title: shortText,
    introduction: text,
    pageIds: z.array(z.uuid()).max(24),
    layout: z.enum(["cards", "carousel"]),
    emptyText: shortText,
  }),
  block("HeroSlider", {
    label: shortText,
    items: z
      .array(
        z.strictObject({
          title: shortText,
          body: text,
          assetId,
          alt: shortText,
          buttonLabel: shortText,
          buttonHref: link,
          focalX: z.number().int().min(0).max(100).optional(),
          focalY: z.number().int().min(0).max(100).optional(),
        }),
      )
      .max(8),
    position: z.enum(["left", "right"]),
  }),
  block("FeatureSection", {
    eyebrow: shortText,
    title: shortText,
    body: text,
    assetId,
    alt: shortText,
    imagePosition: z.enum(["left", "right"]),
    items: z
      .array(z.strictObject({ title: shortText, text, icon: featureIcon }))
      .max(8),
    buttonLabel: shortText,
    buttonHref: link,
  }),
  block("Programme", {
    title: shortText,
    introduction: text,
    items: z
      .array(
        z.strictObject({
          time: z.string().max(80),
          title: shortText,
          description: text,
        }),
      )
      .max(30),
  }),
  block("ParticipationOptions", {
    title: shortText,
    introduction: text,
    items: z
      .array(
        z.strictObject({
          title: shortText,
          priceLabel: z.string().max(100),
          description: text,
          features: z.array(z.strictObject({ text: shortText })).max(12),
          badge: z.string().max(80),
          buttonLabel: shortText,
          buttonHref: link,
        }),
      )
      .max(6),
  }),
  block("EventCollection", {
    title: shortText,
    introduction: text,
    period: z.enum(["upcoming", "past", "all", "featured"]),
    limit: z.number().int().min(1).max(24),
    layout: z.enum(["cards", "list"]),
  }),
] as const;
