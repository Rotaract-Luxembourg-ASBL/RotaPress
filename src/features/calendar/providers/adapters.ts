import "server-only";
import { IcalendarAdapter } from "./IcalendarAdapter";
import type { CalendarImportAdapter } from "./CalendarImportAdapter";

// Contributions are registered explicitly after code review; no remote module loading.
const adapters: readonly CalendarImportAdapter[] = [new IcalendarAdapter()];
export const calendarImportProviders = adapters.map(({ key, label }) => ({
  key,
  label,
}));
export function calendarImportAdapter(key: string) {
  const adapter = adapters.find((item) => item.key === key);
  if (!adapter) throw new Error("This calendar provider is unavailable.");
  return adapter;
}
