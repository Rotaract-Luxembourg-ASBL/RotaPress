"use client";

import { useEffect } from "react";
import { useResource } from "@/ui/api";
import type { EventReadiness } from "../event_readiness";

/** Refresh shared guidance after event changes or returning from a page/form editor. */
export function useEventReadiness(eventId: string, version: number) {
  const resource = useResource<EventReadiness>(
    `/api/admin/events/${eventId}/readiness?version=${version}`,
  );
  const refresh = resource.refresh;
  useEffect(() => {
    const events = [
      "focus",
      "event-pages-updated",
      "event-registration-updated",
    ];
    for (const event of events) window.addEventListener(event, refresh);
    return () => {
      for (const event of events) window.removeEventListener(event, refresh);
    };
  }, [refresh]);
  return resource;
}
