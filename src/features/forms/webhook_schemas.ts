import { z } from "zod";

export const webhookEndpointSchema = z
  .url()
  .max(1000)
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (!url.port || url.port === "443") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^[a-z0-9.-]+$/i.test(url.hostname) &&
      url.hostname.includes(".") &&
      !/^\d+(\.\d+){3}$/.test(url.hostname) &&
      !/(^|\.)(localhost|local|internal|test|invalid|example)$/i.test(
        url.hostname,
      )
    );
  }, "Use a public HTTPS hostname on port 443, without credentials, query parameters or fragments.");

export const webhookSaveSchema = z
  .object({
    expectedRevision: z.int().nonnegative(),
    endpoint: webhookEndpointSchema,
    enabled: z.boolean(),
    secret: z
      .string()
      .min(32)
      .max(128)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
  })
  .strict();

export type WebhookSettings = {
  configured: boolean;
  endpoint: string;
  enabled: boolean;
  revision: number;
  secretConfigured: boolean;
  deliveryEnabled: boolean;
  deliveries: {
    id: string;
    submissionId: string;
    status: string;
    attempts: number;
    errorCode: string | null;
    createdAt: string;
  }[];
};
