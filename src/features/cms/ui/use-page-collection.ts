"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, request } from "@/ui/api";
import type { PageCollection } from "../cms_workspace_schemas";

/** Rows and counts always belong to the current query, including after retry. */
export function usePageCollection(path: string | null) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: PageCollection;
    error?: string;
  }>();
  const key = `${revision}:${path}`;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    request<PageCollection>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key, error: errorMessage(cause) });
      });
    return () => controller.abort();
  }, [key, path]);
  const current = path && result?.key === key ? result : undefined;
  return { data: current?.data, error: current?.error, refresh };
}
