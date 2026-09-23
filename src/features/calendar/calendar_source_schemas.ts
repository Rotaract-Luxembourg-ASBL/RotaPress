import { z } from "zod";
import { zoneSchema, type Occurrence } from "./calendar_schemas";
export const sourcePreviewSchema = z.strictObject({
  calendarId: z.uuid(),
  provider: z.string().max(40),
  document: z.string().min(1).max(524288),
  timezone: zoneSchema,
});
export const sourceCreateSchema = sourcePreviewSchema.extend({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
  endpoint: z.string().max(500).optional(),
  automatic: z.boolean().default(false),
});
export const sourceOperationSchema = z.strictObject({
  id: z.uuid(),
  expectedVersion: z.number().int().positive(),
  operation: z.enum(["publish", "pause", "resume", "refresh", "remove"]),
});
export type CalendarSourceSummary = {
  id: string;
  calendarId: string;
  name: string;
  provider: string;
  timezone: string;
  version: number;
  enabled: boolean;
  automatic: boolean;
  connected: boolean;
  host: string | null;
  published: boolean;
  changed: boolean;
  checkedAt: string | null;
  error: string | null;
};
export type CalendarSourcesWorkspace = {
  providers: { key: string; label: string }[];
  items: CalendarSourceSummary[];
  connectionAllowed: boolean;
  remoteEnabled: boolean;
};
export type CalendarImportPreview = {
  digest: string;
  items: Occurrence[];
  count: number;
};
