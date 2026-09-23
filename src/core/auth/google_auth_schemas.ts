import { z } from "zod";

export const googleClientIdSchema = z
  .string()
  .trim()
  .max(300)
  .regex(
    /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/,
    "Enter a Google Web application client ID.",
  );
export const googleClientSecretSchema = z
  .string()
  .min(16)
  .max(512)
  .regex(
    /^[\x21-\x7e]+$/,
    "Use the client secret exactly as provided, without spaces.",
  );
export const googleAuthSaveSchema = z
  .object({
    expectedVersion: z.int().nonnegative(),
    clientId: googleClientIdSchema,
    clientSecret: googleClientSecretSchema.optional(),
  })
  .strict();
export const googleAuthActionSchema = z
  .object({
    expectedVersion: z.int().nonnegative(),
    confirmed: z.literal(true),
  })
  .strict();
export const googleAuthEnabledSchema = googleAuthActionSchema.extend({
  enabled: z.boolean(),
});

export type GoogleAuthSettings = {
  version: number;
  configured: boolean;
  enabled: boolean;
  clientId: string;
  hasSecret: boolean;
  encryptionReady: boolean;
  verifiedAt: string | null;
  staffRequiresGoogle: boolean;
  canManage: boolean;
  callbackUrl: string;
  origin: string;
};
