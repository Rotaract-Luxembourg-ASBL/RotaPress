import { z } from "zod";

const reserved = new Set([
  "home",
  "join",
  "calendar",
  "calendars",
  "embed",
  "signin",
  "sign-in",
  "login",
  "settings",
  "api",
  "p",
  "discover",
  "pricing",
  "terms",
  "privacy",
]);
export const lumaEventUrlSchema = z
  .string()
  .trim()
  .max(260)
  .transform((input, ctx) => {
    try {
      const url = new URL(input);
      const slug = url.pathname.replace(/\/$/, "").slice(1);
      if (
        url.protocol !== "https:" ||
        !["luma.com", "lu.ma"].includes(url.hostname) ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(slug) ||
        reserved.has(slug.toLowerCase())
      )
        throw new Error();
      return `https://${url.hostname}/${slug}`;
    } catch {
      ctx.addIssue({
        code: "custom",
        message:
          "Use a Luma event link such as https://luma.com/your-event, without query parameters, fragments or embed code.",
      });
      return z.NEVER;
    }
  });
export const lumaAvailabilitySchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  enabled: z.boolean(),
  confirmed: z.literal(true),
});
export const lumaLinkDraftSchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  url: lumaEventUrlSchema,
});
export const lumaLinkPublicationSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  expectedRegistrationVersion: z.number().int().nonnegative(),
  operation: z.enum(["publish", "unpublish"]),
  confirmed: z.literal(true),
});
export type LumaAvailabilityDto = {
  enabled: boolean;
  version: number;
  publishedLinkCount: number;
};
export type LumaLinkDto = {
  enabled: boolean;
  version: number;
  draftUrl: string;
  publishedUrl: string | null;
  published: boolean;
  registrationVersion: number;
  authority: "none" | "native" | "luma";
};
