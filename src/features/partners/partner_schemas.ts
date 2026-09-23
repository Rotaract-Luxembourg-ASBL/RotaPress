import { z } from "zod";
import { isSafeLink } from "../../core/safe-link";

/** Public profile fields only. Relationship notes and private contacts are not website content. */
export const partnerProfileSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
  category: z.enum(["partner", "sponsor", "team"]),
  role: z.string().trim().max(120).optional(),
  description: z.string().max(1000),
  website: z
    .string()
    .max(2000)
    .refine(isSafeLink, "Use a local path or an http(s) link."),
  logoId: z.uuid().nullable(),
});
export type PartnerProfile = z.infer<typeof partnerProfileSchema>;
export type PublicPartner = PartnerProfile & { id: string };
export type PartnerPlacement = {
  dynamic?: boolean;
  id: string | null;
  title: string;
  locale: string | null;
  eventId: string | null;
};
export type PartnerDto = {
  id: string;
  version: number;
  draft: PartnerProfile;
  published: PartnerProfile | null;
  previous: PartnerProfile | null;
  changed: boolean;
  placements: PartnerPlacement[];
};
export const partnerVersionSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
});
export const partnerSaveSchema = partnerVersionSchema.extend({
  profile: partnerProfileSchema,
});
export const partnerPublicationSchema = partnerVersionSchema.extend({
  confirmed: z.literal(true),
});
