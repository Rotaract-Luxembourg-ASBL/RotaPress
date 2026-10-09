import { z } from "zod";

const region = z.enum(["body", "header", "navigation", "main", "footer"]);
export const referenceOutlineSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("heading"),
    region,
    level: z.int().min(1).max(6),
    text: z.string().max(250),
  }),
  z.strictObject({
    type: z.literal("paragraph"),
    region,
    text: z.string().max(1500),
  }),
  z.strictObject({
    type: z.literal("image"),
    region,
    imageIndex: z.int().min(0).max(29),
  }),
  z.strictObject({
    type: z.literal("link"),
    region,
    href: z.string().max(1000),
    label: z.string().max(250),
  }),
]);
export type ReferenceOutline = z.infer<typeof referenceOutlineSchema>;
export const referenceImageSchema = z.strictObject({
  url: z.string().max(1000),
  alt: z.string().max(250),
  width: z.int().positive().max(20000).nullable(),
  height: z.int().positive().max(20000).nullable(),
});
export type ReferenceImage = z.infer<typeof referenceImageSchema>;

export const referenceOutput = z.strictObject({
  sourceUrl: z.string(),
  trust: z.literal("untrusted-reference-content"),
  title: z.string().max(200),
  headings: z.array(z.string().max(250)).max(50),
  text: z.string().max(24000),
  links: z.array(z.string()).max(60),
  outline: z.array(referenceOutlineSchema).max(120),
  images: z.array(referenceImageSchema).max(30),
  truncated: z.boolean(),
  limitations: z.array(z.string()).max(10),
  instructions: z.string(),
});
