import type { CalendarRange, Occurrence } from "../calendar_schemas";

/** A reviewed code contribution, never code uploaded by a website user.
 * Adapters parse untrusted documents. Services own authorization, storage,
 * network access, publication, jobs and subscriptions. */
export interface CalendarImportAdapter {
  readonly key: string;
  readonly label: string;
  normalize(document: string, timezone: string): string;
  occurrences(
    document: string,
    timezone: string,
    sourceId: string,
    calendarId: string,
    range: CalendarRange,
  ): Occurrence[];
}
