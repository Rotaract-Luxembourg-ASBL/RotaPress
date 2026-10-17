"use client";
import { useSearchParams } from "next/navigation";
import { rememberCollectionPosition } from "./collection-position";

/** Keep collection filters when opening a newly created record. */
export function collectionEditorHref(href: string, collectionPath: string) {
  rememberCollectionPosition();
  if (window.location.pathname !== collectionPath || !window.location.search)
    return href;
  const returnTo = `${collectionPath}${window.location.search}`;
  return `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;
}

export function useCollectionReturn(fallback: string) {
  const params = useSearchParams();
  const requested = params.get("returnTo");
  return requested &&
    (requested === fallback || requested.startsWith(`${fallback}?`))
    ? requested
    : fallback;
}
