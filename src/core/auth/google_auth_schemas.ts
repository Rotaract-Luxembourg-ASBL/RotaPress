import { z } from "zod";
export const hostedDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .refine(
    (value) =>
      value === "" ||
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value),
    "Enter a domain such as rotaract.lu, without @ or https://.",
  );

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
    hostedDomain: hostedDomainSchema.optional(),
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
  hostedDomain: string;
  hasSecret: boolean;
  encryptionReady: boolean;
  verifiedAt: string | null;
  staffRequiresGoogle: boolean;
  canManage: boolean;
  callbackUrl: string;
  origin: string;
};
