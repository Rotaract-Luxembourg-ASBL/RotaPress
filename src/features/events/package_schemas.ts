import { z } from "zod";
import { lumaEventUrlSchema } from "../../integrations/luma/luma_schemas";

export const packageDraftSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000),
  priceMinor: z.number().int().min(0).max(100_000_000),
  currency: z.enum(["EUR", "USD", "GBP", "CHF"]),
  showPrice: z.boolean(),
  checkoutEnabled: z.boolean(),
  position: z.number().int().min(0).max(1000),
});
export type PackageDraft = z.infer<typeof packageDraftSchema>;
export const packageSaveSchema = z.strictObject({
  id: z.uuid().optional(),
  expectedVersion: z.number().int().min(0),
  sourceId: z.uuid().nullable(),
  draft: packageDraftSchema,
});
export const packageSourceSchema = z.union([
  z.strictObject({
    label: z.string().trim().min(1).max(120),
    url: lumaEventUrlSchema,
  }),
  z.strictObject({
    id: z.uuid(),
    expectedVersion: z.number().int().positive(),
    label: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
    confirmed: z.literal(true),
  }),
]);
export const packagePublicationSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  expectedSourceVersion: z.number().int().positive().optional(),
  operation: z.enum(["publish", "unpublish"]),
  confirmed: z.literal(true),
});
export type PackageSource = {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  version: number;
};
export type PublicPackage = {
  id: string;
  revisionId: string;
  title: string;
  description: string;
  priceMinor: number | null;
  currency: PackageDraft["currency"] | null;
  position: number;
  checkoutUrl: string | null;
};
export type PackageWorkspace = {
  sources: PackageSource[];
  packages: {
    id: string;
    version: number;
    draft: PackageDraft;
    sourceId: string | null;
    published: PublicPackage | null;
  }[];
  checkoutAvailable: boolean;
  canPublish: boolean;
  canEdit: boolean;
};
