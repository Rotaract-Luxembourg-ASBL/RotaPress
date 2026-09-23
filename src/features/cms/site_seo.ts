import { z } from "zod";
import { brandingAssetIds } from "./website_branding";
import type { SiteSettings } from "./cms_schemas";

export const siteSeoSchema = z.strictObject({
  title: z.string().trim().max(160),
  description: z.string().trim().max(300),
  socialImageId: z.uuid().nullable(),
  indexable: z.boolean(),
  googleVerification: z
    .string()
    .trim()
    .max(160)
    .regex(/^[A-Za-z0-9_-]*$/),
});
export const defaultSiteSeo: z.infer<typeof siteSeoSchema> = {
  title: "",
  description: "",
  socialImageId: null,
  indexable: true,
  googleVerification: "",
};
export function siteAssetIds(settings: SiteSettings): string[] {
  return [
    ...new Set([
      ...brandingAssetIds(settings.branding),
      ...(settings.seo?.socialImageId ? [settings.seo.socialImageId] : []),
    ]),
  ];
}
