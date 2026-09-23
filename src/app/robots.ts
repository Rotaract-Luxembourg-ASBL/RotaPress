import type { MetadataRoute } from "next";
import { config } from "@/core/config";

export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api",
        "/membership",
        "/guest",
        "/registrations",
        "/sign-in",
        "/setup",
        "/recovery",
      ],
    },
    sitemap: `${config.APP_URL}/sitemap.xml`,
  };
}
