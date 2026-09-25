import { z } from "zod";
import { clubProfileLabels } from "@/core/organization/club_profile";

export const clubDetailKeys = [
  "name",
  "tagline",
  "description",
  "clubType",
  "districtNumber",
  "clubNumber",
  "city",
  "country",
  "region",
  "postalCode",
  "address",
  "publicEmail",
  "phone",
  "charterDate",
  "sponsorClub",
  "meetingDetails",
  "websiteUrl",
  "meetingUrl",
  "polarisUrl",
] as const;
export const clubDetailKeySchema = z.enum(clubDetailKeys);
export const clubDetailLabels = {
  name: "Club name",
  tagline: "Tagline",
  description: "About the club",
  ...clubProfileLabels,
};
