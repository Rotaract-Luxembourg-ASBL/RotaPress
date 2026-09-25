import { z } from "zod";
import {
  clubProfileSchema,
  defaultClubProfile,
  defaultStaffLogin,
  staffLoginSchema,
} from "./club_profile";

export const organizationIdentitySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    tagline: z.string().trim().max(180).default(""),
    description: z.string().trim().max(2000).default(""),
    profile: clubProfileSchema.default(defaultClubProfile),
    locale: z.enum(["en", "fr", "lb"]),
    timezone: z
      .string()
      .trim()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid IANA timezone."),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit hex color.")
      .default("#25636b"),
  })
  .strict();

export const organizationSettingsSchema = organizationIdentitySchema.extend({
  staffAuthPolicy: z.enum(["email-or-google", "google"]),
  staffLogin: staffLoginSchema.default(defaultStaffLogin),
});

export type PublicOrganization = z.output<typeof organizationIdentitySchema>;
export type OrganizationSettings = z.output<typeof organizationSettingsSchema>;
