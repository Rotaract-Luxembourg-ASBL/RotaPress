import type { PublicSite } from "./cms_schemas";
import type { templateBrands } from "./template_brand";
import { defaultWebsiteBranding } from "./website_branding";

/** Resolve shared identity without changing explicitly configured block logos. */
export function resolveWebsiteBranding(
  site: Partial<Pick<PublicSite, "themeId" | "branding">>,
  fallbackMark?: keyof typeof templateBrands,
) {
  const branding = site.branding ?? defaultWebsiteBranding;
  const templateMark =
    fallbackMark ??
    (site.themeId === "rotary-service"
      ? "rotary"
      : site.themeId === "rotaract-action"
        ? "rotaract"
        : undefined);
  const mark =
    branding.mark === "template"
      ? templateMark
      : branding.mark === "none"
        ? undefined
        : branding.mark;
  return {
    logoId: branding.logoId,
    logoAlt: branding.logoAlt,
    showName: branding.logoId ? branding.showName : true,
    mark,
  };
}
