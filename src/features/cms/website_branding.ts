import { z } from "zod";

/** Shared identity for club pages and public forms; templates provide its fallback artwork. */
export const websiteBrandingSchema = z.strictObject({
  logoId: z.uuid().nullable().default(null),
  logoAlt: z.string().trim().max(250).default(""),
  iconId: z.uuid().nullable().default(null),
  mark: z.enum(["template", "none", "rotary", "rotaract"]).default("template"),
  showName: z.boolean().default(true),
});

export type WebsiteBranding = z.infer<typeof websiteBrandingSchema>;
export const defaultWebsiteBranding: WebsiteBranding =
  websiteBrandingSchema.parse({});

export function brandingAssetIds(branding: WebsiteBranding): string[] {
  return [
    ...new Set(
      [branding.logoId, branding.iconId].filter((id): id is string =>
        Boolean(id),
      ),
    ),
  ];
}
