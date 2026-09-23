"use client";

import { createContext, useContext, useEffect } from "react";
import type { CmsDetail } from "../cms_schemas";

export const EventEditorScope = createContext<CmsDetail["event"]>(undefined);
export const useEditorEvent = () => useContext(EventEditorScope);

/** Form and registration setup opens in another tab; preserve the page draft on return. */
export function useRefreshOnFocus(refresh: () => void) {
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
}
