import { z } from "zod";
import { isSafeLink } from "../../core/safe-link";

/** Public editorial content only; volunteering does not imply participant records. */
export const projectContentSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().max(320).default(""),
    story: z.string().trim().max(12000).default(""),
    status: z.enum(["planned", "ongoing", "completed"]).default("planned"),
    location: z.string().trim().max(160).default(""),
    startDate: z.iso.date().nullable().default(null),
    endDate: z.iso.date().nullable().default(null),
    coverImageId: z.uuid().nullable().default(null),
    outcomes: z.string().trim().max(4000).default(""),
    linkLabel: z.string().trim().max(80).default(""),
    linkUrl: z
      .string()
      .trim()
      .max(2000)
      .refine(isSafeLink, "Use a local path or an http(s) link.")
      .default(""),
  })
  .refine(
    (value) =>
      !value.startDate || !value.endDate || value.endDate >= value.startDate,
    {
      path: ["endDate"],
      message: "The end date must be on or after the start date.",
    },
  )
  .refine((value) => Boolean(value.linkUrl) === Boolean(value.linkLabel), {
    path: ["linkLabel"],
    message: "Add both a button label and a link, or leave both empty.",
  });

export type ProjectContent = z.infer<typeof projectContentSchema>;
export type PublicProject = ProjectContent & {
  id: string;
  slug: string;
  coverAlt?: string;
};
export type ProjectDto = {
  id: string;
  slug: string;
  version: number;
  draft: ProjectContent;
  published: ProjectContent | null;
  changed: boolean;
  archived: boolean;
};

export const projectVersionSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
});
export const projectSaveSchema = projectVersionSchema.extend({
  content: projectContentSchema,
});
export const projectActionSchema = projectVersionSchema.extend({
  confirmed: z.literal(true),
});
