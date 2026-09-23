import { z } from "zod";
import { assetId, block, link, shortText, text } from "../cms/block_fields";
import { isSafeLink } from "../../core/safe-link";

const contactEmail = z
  .union([z.email().max(254), z.literal("")])
  .refine(
    (value) => !/[?&#%\r\n]/u.test(value),
    "Use an email address without link parameters.",
  );
const contactWebsite = z
  .string()
  .max(2_000)
  .refine(
    (value) => !value || (value.startsWith("https://") && isSafeLink(value)),
    "Use an https website address without credentials.",
  );

/** Event content uses the same immutable revisions, layout and media policy as CMS blocks. */
export const eventContentBlockSchemas = [
  block("EventHero", {
    badge: shortText,
    tagline: shortText,
    assetId,
    imageAlt: shortText,
    layout: z.enum(["centered", "left", "split"]),
    height: z.enum(["compact", "full"]),
    overlay: z.number().int().min(0).max(85),
    countdown: z.boolean(),
    buttonLabel: shortText,
    buttonHref: link,
  }),
  block("EventPractical", {
    title: shortText,
    address: text,
    directions: link,
    items: z.array(z.strictObject({ label: shortText, text })).max(20),
  }),
  block("EventImpact", {
    title: shortText,
    introduction: text,
    heading: shortText,
    text,
    items: z
      .array(z.strictObject({ label: shortText, text: shortText }))
      .max(8),
    buttonLabel: shortText,
    buttonHref: link,
  }),
  block("EventFooter", {
    heading: shortText,
    text,
    email: contactEmail,
    links: z.array(z.strictObject({ label: shortText, href: link })).max(8),
    showNavigation: z.boolean(),
  }),
  block("EventContact", {
    title: shortText,
    text,
    email: contactEmail,
    phone: z
      .string()
      .max(40)
      .regex(/^[+0-9 ().-]*$/u, "Use a phone number."),
    website: contactWebsite,
  }),
  block("EventFlyer", {
    title: shortText,
    assetId: z.union([z.uuid(), z.literal("")]),
    alt: shortText,
    caption: shortText,
  }),
  block("EventShare", { title: shortText }),
  block("EventPackages", { title: shortText }),
  block("EventPrizes", { title: shortText }),
  block("EventWinners", { title: shortText }),
] as const;

export const eventOnlyBlockTypes = [
  "EventHero",
  "EventPractical",
  "EventImpact",
  "EventFooter",
  "EventRegistration",
  "EventContact",
  "EventFlyer",
  "EventShare",
  "EventPackages",
  "EventPrizes",
  "EventWinners",
] as const;
