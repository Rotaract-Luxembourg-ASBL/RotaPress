import { z } from "zod";

/** Reviewed bundled photographs only; never interpolate arbitrary paths or remote URLs. */
export const templateImageIdSchema = z.enum([
  "template:garden",
  "template:seedlings",
  "template:herbs",
]);
export const templateImages = {
  "template:garden": {
    src: "/templates/shared/garden.jpg",
    title: "Garden",
    alt: "Greenhouses and raised garden beds",
  },
  "template:seedlings": {
    src: "/templates/shared/seedlings.jpg",
    title: "Seedlings",
    alt: "Young plants growing in soil",
  },
  "template:herbs": {
    src: "/templates/shared/herbs.jpg",
    title: "Herbs",
    alt: "Herbs growing in bamboo containers",
  },
} as const;
export const defaultTemplateImages = [...templateImageIdSchema.options];
export function templateImage(id: string) {
  const parsed = templateImageIdSchema.safeParse(id);
  return parsed.success ? templateImages[parsed.data] : undefined;
}

/** Uploaded media still travels through the scoped /media route. */
export function cmsImageSource(id: string): string | undefined {
  return (
    templateImage(id)?.src ??
    (z.uuid().safeParse(id).success ? `/media/${id}` : undefined)
  );
}
