import { z } from "zod";

const version = z.number().int().nonnegative();
export const connectionSaveSchema = z
  .object({
    expectedVersion: version,
    apiKey: z
      .string()
      .trim()
      .min(16)
      .max(512)
      .regex(
        /^[\x21-\x7e]+$/,
        "Use a key without spaces or control characters.",
      ),
    confirmed: z.literal(true),
  })
  .strict();
export const connectionActionSchema = z
  .object({
    expectedVersion: version,
    confirmed: z.literal(true),
  })
  .strict();

export const connectionMessages = {
  SYNC_LIMIT:
    "This event exceeds the current reconciliation limit. No guest projection was changed.",
  AUTH_REJECTED:
    "Luma rejected the key or its calendar access. Replace the key and check again.",
  RATE_LIMITED:
    "Luma rate limited this check. Wait at least one minute before retrying.",
  PROVIDER_UNAVAILABLE:
    "Luma is unavailable. The saved connection and event content are retained.",
  INVALID_RESPONSE:
    "Luma returned an unexpected response. No provider data was accepted.",
  REQUEST_FAILED:
    "The provider request could not complete within its time limit.",
  CALENDAR_CHANGED:
    "This key belongs to a different calendar. Restore a key for the selected calendar; changing calendars requires a separate migration.",
  CREDENTIAL_UNREADABLE:
    "The saved key could not be decrypted. Restore the installation encryption key or replace this credential.",
  DISABLED: "Luma was disabled during this check. Allow it and check again.",
} as const;
export type ConnectionCode = keyof typeof connectionMessages;
export type ConnectionMode = "blocked" | "live" | "fixture";
export const connectionStateLabels = {
  disconnected: "No API key saved",
  unchecked: "Saved · not checked",
  checking: "Check in progress",
  interrupted: "Check interrupted · retry available",
  verified: "Calendar access checked",
  failed: "Check failed",
} as const;
export type LumaConnectionDto = {
  id: string | null;
  version: number;
  hasCredential: boolean;
  calendarId: string | null;
  state:
    | "unchecked"
    | "checking"
    | "verified"
    | "failed"
    | "disconnected"
    | "interrupted";
  message: string | null;
  attemptedAt: string | null;
  checkedAt: string | null;
  lastSuccessAt: string | null;
  encryptionReady: boolean;
  allowed: boolean;
  mode: ConnectionMode;
};
