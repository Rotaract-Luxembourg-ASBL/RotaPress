import type { Metadata } from "next";
import type { PublicSite } from "./cms_schemas";
import { clubPageTitle } from "./page_title";

/** Only published site/page values enter this metadata builder. */
export function publicMetadata(input: {
  title: string;
  clubName?: string;
  description: string;
  socialImageId?: string | null;
  canonical: string;
  origin: string;
  site: PublicSite;
}): Metadata {
  const seo = input.site.seo;
  const title = clubPageTitle(
    input.title || seo?.title || "",
    input.clubName ?? "",
  );
  const description = input.description || seo?.description || "";
  const image = input.socialImageId || seo?.socialImageId;
  const images = image ? [`${input.origin}/media/${image}`] : [];
  return {
    title: input.clubName ? { absolute: title } : title,
    description,
    alternates: { canonical: input.canonical },
    robots:
      seo?.indexable === false
        ? { index: false, follow: true }
        : { index: true, follow: true },
    openGraph: {
      siteName: input.clubName,
      title,
      description,
      url: input.canonical,
      images,
      type: "website",
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      images,
    },
  };
}
