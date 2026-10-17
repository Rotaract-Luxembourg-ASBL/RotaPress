"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Position = {
  top: number;
  anchor?: string;
  label?: string;
  offset?: number;
};
const positions = new Map<string, Position>();
const collectionPath =
  /^\/admin\/(?:website|media(?:\/albums)?|projects|events|forms|inbox|members|partners|calendar)$|^\/admin\/forms\/[^/]+\/submissions$/;

function locationKey(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    url.searchParams.sort();
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/** Keep only tab-local positions, bounded independently of collection size. */
export function rememberCollectionPosition(anchor?: HTMLAnchorElement) {
  if (!collectionPath.test(window.location.pathname)) return;
  const key = locationKey(window.location.href)!;
  positions.delete(key);
  positions.set(key, {
    top: window.scrollY,
    ...(anchor
      ? {
          anchor: anchor.getAttribute("href") ?? undefined,
          label:
            anchor.getAttribute("aria-label") ?? anchor.textContent?.trim(),
          offset: anchor.getBoundingClientRect().top,
        }
      : {}),
  });
  if (positions.size > 40) positions.delete(positions.keys().next().value!);
}

function restore(position: Position) {
  let stopped = false;
  let frame = 0;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    clearTimeout(timeout);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stop);
    window.removeEventListener("pointerdown", stop);
  };
  const apply = () => {
    if (stopped) return;
    const anchor = position.anchor
      ? Array.from(
          document.querySelectorAll<HTMLAnchorElement>("main a[href]"),
        ).find(
          (item) =>
            item.getAttribute("href") === position.anchor &&
            (item.getAttribute("aria-label") ?? item.textContent?.trim()) ===
              position.label,
        )
      : undefined;
    // Wait for the requested row, including asynchronously expanded page trees.
    if (position.anchor && !anchor) return;
    const top = anchor
      ? window.scrollY +
        anchor.getBoundingClientRect().top -
        (position.offset ?? 0)
      : position.top;
    if (document.documentElement.scrollHeight - window.innerHeight < top)
      return;
    window.scrollTo({ top, behavior: "instant" });
    stop();
  };
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  });
  observer.observe(document.body, { subtree: true, childList: true });
  // A deleted/moved row can no longer be found; use the nearest surviving position.
  const timeout = window.setTimeout(() => {
    window.scrollTo({ top: position.top, behavior: "instant" });
    stop();
  }, 10000);
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("keydown", stop);
  window.addEventListener("pointerdown", stop);
  frame = requestAnimationFrame(apply);
  return stop;
}

/** Restore only returning from a detail route, never during search/filter changes. */
export function useCollectionPosition() {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const previous = useRef<{ pathname: string; returnTo: string | null }>(null);
  useEffect(() => {
    const prior = previous.current;
    previous.current = { pathname, returnTo: params.get("returnTo") };
    const key = locationKey(`${pathname}${query ? `?${query}` : ""}`)!;
    const position = positions.get(key);
    const returning =
      prior &&
      prior.pathname !== pathname &&
      (prior.returnTo
        ? locationKey(prior.returnTo) === key
        : prior.pathname.startsWith(`${pathname}/`));
    const cancel =
      collectionPath.test(pathname) && returning && position
        ? restore(position)
        : undefined;
    function record(event: MouseEvent) {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("main a[href]")
          : null;
      if (!anchor || anchor.target === "_blank") return;
      const target = new URL(anchor.href, window.location.origin);
      if (
        target.origin === window.location.origin &&
        target.pathname !== pathname
      )
        rememberCollectionPosition(anchor);
    }
    document.addEventListener("click", record, true);
    return () => {
      document.removeEventListener("click", record, true);
      cancel?.();
    };
  }, [pathname, query, params]);
}
