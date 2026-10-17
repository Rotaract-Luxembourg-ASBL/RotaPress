"use client";

import { usePathname, useSearchParams } from "next/navigation";

/** Shareable filters survive detail navigation and browser history. */
export function useCollectionLocation() {
  const params = useSearchParams();
  const pathname = usePathname();
  function change(
    values: Record<string, string | number | undefined>,
    resetPage = true,
  ) {
    const next = new URLSearchParams(window.location.search);
    if (resetPage) next.delete("page");
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, String(value));
    }
    const query = next.toString();
    // Next copies its router state. Passing __NA back ourselves skips its
    // URL subscription update and leaves every collection on the old filters.
    window.history.replaceState(
      null,
      "",
      `${pathname}${query ? `?${query}` : ""}`,
    );
  }
  const rawPage = Number(params.get("page"));
  return {
    params,
    change,
    page:
      Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 100000
        ? rawPage
        : 1,
  };
}
