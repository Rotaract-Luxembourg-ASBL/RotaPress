"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { MediaSort, VisibilityFilter } from "./media-browser";
import type { MediaAssetDto } from "@/features/media/media_schemas";
export type MediaKindFilter = "all" | MediaAssetDto["kind"];

/** Keep a returnable library location without rerendering the entire server page. */
export function useMediaLibraryLocation() {
  const params = useSearchParams();
  const pathname = usePathname();
  function change(key: string, value: string, fallback = "") {
    const next = new URLSearchParams(window.location.search);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    window.history.replaceState(
      null,
      "",
      `${pathname}${query ? `?${query}` : ""}`,
    );
  }
  const visibility: VisibilityFilter =
    params.get("visibility") === "public"
      ? "public"
      : params.get("visibility") === "private"
        ? "private"
        : "all";
  const sort: MediaSort =
    params.get("sort") === "oldest"
      ? "oldest"
      : params.get("sort") === "title"
        ? "title"
        : "newest";
  const rawPage = Number(params.get("page"));
  const kind: MediaKindFilter = [
    "image",
    "document",
    "audio",
    "video",
  ].includes(params.get("kind") ?? "")
    ? (params.get("kind") as MediaKindFilter)
    : "all";
  const date = (key: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(params.get(key) ?? "") ? params.get(key)! : "";
  return {
    query: params.get("search") ?? "",
    kind,
    setKind: (value: MediaKindFilter) => change("kind", value, "all"),
    setQuery: (value: string) => change("search", value),
    visibility,
    setVisibility: (value: VisibilityFilter) =>
      change("visibility", value, "all"),
    collection: params.get("collection") ?? "",
    setCollection: (value: string) => change("collection", value),
    sort,
    setSort: (value: MediaSort) => change("sort", value, "newest"),
    dateFrom: date("dateFrom"),
    setDateFrom: (value: string) => change("dateFrom", value),
    dateTo: date("dateTo"),
    setDateTo: (value: string) => change("dateTo", value),
    page:
      Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 1_000_000
        ? rawPage
        : 1,
    setPage: (value: number) => change("page", String(value), "1"),
    view: params.get("view") === "list" ? ("list" as const) : ("grid" as const),
    setView: (value: "grid" | "list") => change("view", value, "grid"),
  };
}
