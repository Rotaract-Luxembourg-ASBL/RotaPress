import { z } from "zod";
import type { PublicPartner } from "../partners/partner_schemas";

/** Editorial display only; quantities never issue entries or establish eligibility. */
export const prizeDraftSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(3000),
    imageId: z.uuid().nullable(),
    alt: z.string().trim().max(200),
    quantity: z.number().int().min(1).max(10_000),
    position: z.number().int().min(0).max(9999),
    partnerId: z.uuid().nullable(),
  })
  .refine((value) => !value.imageId || Boolean(value.alt), {
    path: ["alt"],
    message: "Describe the selected prize image.",
  });
export type PrizeDraft = z.infer<typeof prizeDraftSchema>;
export const prizeSaveSchema = z.strictObject({
  id: z.uuid().optional(),
  expectedVersion: z.number().int().min(0),
  draft: prizeDraftSchema,
});
export const prizePublicationSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  operation: z.enum(["publish", "unpublish"]),
  confirmed: z.literal(true),
});
export type PublicPrize = Omit<PrizeDraft, "partnerId"> & {
  id: string;
  revisionId: string;
  partner: PublicPartner | null;
};
export type PrizeWorkspace = {
  items: {
    id: string;
    version: number;
    draft: PrizeDraft;
    published: PublicPrize | null;
  }[];
  canEdit: boolean;
  canPublish: boolean;
  canUnpublish: boolean;
};
