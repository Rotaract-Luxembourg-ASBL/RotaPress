"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, request } from "@/ui/api";
import type { InboxPage } from "../inbox_schemas";

/** A changed filter must not show responses from the previous filter. */
export function useInboxPage<T = InboxPage>(path: string | null) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    data?: T;
    error?: string;
  }>();
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!path) return;
    let active = true;
    const controller = new AbortController();
    request<T>(path, { signal: controller.signal })
      .then((data) => {
        if (active) setResult({ path, data });
      })
      .catch((cause: unknown) => {
        if (active)
          setResult({
            path,
            error: errorMessage(cause),
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, revision]);

  return {
    data: result?.path === path ? result.data : undefined,
    error: result?.path === path ? result.error : undefined,
    refresh,
  };
}
