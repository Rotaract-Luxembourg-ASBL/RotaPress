"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, request } from "./api";

/** Bind results and failures to the current path and refresh request. */
export function useRequestResource<T>(path: string) {
  const [revision, setRevision] = useState(0);
  // A return to the same path is a new request, not its previous failure.
  const requestKey = useMemo(() => ({ path, revision }), [path, revision]);
  const [result, setResult] = useState<{
    key: typeof requestKey;
    data: T;
  }>();
  const [failure, setFailure] = useState<{
    key: typeof requestKey;
    error: string;
  }>();
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    request<T>(requestKey.path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, data });
          setFailure(undefined);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setFailure({ key: requestKey, error: errorMessage(cause) });
      });
    return () => controller.abort();
  }, [requestKey]);
  const current = result?.key === requestKey;
  const failed = failure?.key === requestKey;
  return {
    data: result?.key.path === path ? result.data : undefined,
    error: failed ? failure.error : undefined,
    loading: !current && !failed,
    refresh,
  };
}
