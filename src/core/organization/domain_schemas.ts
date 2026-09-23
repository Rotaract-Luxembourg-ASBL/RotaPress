import { z } from "zod";

export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .refine((value) => {
    if (!value.includes(".") || /^\d+(\.\d+){3}$/.test(value)) return false;
    if (/\.(localhost|local|internal|test|invalid)$/.test(value)) return false;
    return value
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  }, "Enter a public hostname, such as club.example.org, without https://, a path, port or wildcard.");
export const addDomainSchema = z.strictObject({
  hostname: hostnameSchema,
  eventId: z.uuid().nullable().default(null),
});
export const domainActionSchema = z.strictObject({
  id: z.uuid(),
  operation: z.enum(["verify", "remove"]),
});
export type DomainWorkspace = {
  origin: string;
  callbackUrl: string;
  canManage: boolean;
  items: {
    id: string;
    hostname: string;
    recordName: string;
    recordValue: string;
    verifiedAt: string | null;
    active: boolean;
    eventId: string | null;
    eventTitle: string | null;
    destinationUrl: string;
  }[];
};
