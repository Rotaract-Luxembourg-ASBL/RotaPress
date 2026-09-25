import { z } from "zod";

const short = z.string().trim().max(160).default("");
const publicUrl = z
  .union([
    z.literal(""),
    z
      .url()
      .max(1000)
      .refine((value) => {
        try {
          const url = new URL(value);
          return url.protocol === "https:" && !url.username && !url.password;
        } catch {
          return false;
        }
      }, "Use a public HTTPS link without credentials."),
  ])
  .default("");

export const clubProfileSchema = z.strictObject({
  clubType: z
    .enum(["rotary", "rotaract", "interact", "community", "other"])
    .default("community"),
  districtNumber: z
    .string()
    .trim()
    .max(12)
    .regex(/^[0-9]*$/, "Use the district number only.")
    .default(""),
  clubNumber: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9]*$/, "Use the club number only.")
    .default(""),
  city: short,
  country: short,
  region: short,
  postalCode: z.string().trim().max(24).default(""),
  address: z.string().trim().max(500).default(""),
  publicEmail: z.union([z.email().max(254), z.literal("")]).default(""),
  phone: z
    .string()
    .trim()
    .max(60)
    .regex(/^[+0-9() .-]*$/)
    .default(""),
  charterDate: z.union([z.iso.date(), z.literal("")]).default(""),
  sponsorClub: short,
  meetingDetails: z.string().trim().max(1000).default(""),
  websiteUrl: publicUrl,
  meetingUrl: publicUrl,
  polarisUrl: publicUrl,
});
export type ClubProfile = z.output<typeof clubProfileSchema>;
export const defaultClubProfile = clubProfileSchema.parse({});

export const clubProfileLabels: Record<keyof ClubProfile, string> = {
  clubType: "Club type",
  districtNumber: "District number",
  clubNumber: "Club number",
  city: "City",
  country: "Country",
  region: "Region",
  postalCode: "Postal code",
  address: "Public address",
  publicEmail: "Public contact email",
  phone: "Public phone",
  charterDate: "Charter date",
  sponsorClub: "Sponsoring club",
  meetingDetails: "Meeting details",
  websiteUrl: "Club website",
  meetingUrl: "Meeting link",
  polarisUrl: "Polaris link",
};

export const staffLoginSchema = z.strictObject({
  title: z.string().trim().min(1).max(120).default("Welcome to your workspace"),
  description: z.string().trim().max(500).default(""),
  subtitle: z.string().trim().max(120).default("Team workspace"),
  buttonTheme: z.enum(["light", "dark", "neutral"]).default("light"),
  buttonShape: z.enum(["rounded", "pill", "square"]).default("rounded"),
});
export type StaffLogin = z.output<typeof staffLoginSchema>;
export const defaultStaffLogin = staffLoginSchema.parse({});
