"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminMediaAssetDto } from "@/features/media/media_schemas";
import { errorMessage, request } from "./api";

export type MediaCollection = {
  assets: AdminMediaAssetDto[];
  total: number;
  page: number;
  pageSize: number;
  counts: { all: number; public: number; private: number };
  collections: string[];
};

/** Keep a loaded page visible during refresh, but never act on a previous filter. */
export function useMediaCollection(path: string) {
  return useMediaResource<MediaCollection>(path);
}

export function useMediaResource<T>(path: string) {
  const [result, setResult] = useState<{
    path: string;
    revision: number;
    data: T;
  }>();
  const [failure, setFailure] = useState<{
    path: string;
    revision: number;
    error: string;
  }>();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    request<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ path, revision, data });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setFailure({ path, revision, error: errorMessage(cause) });
      });
    return () => controller.abort();
  }, [path, revision]);
  const current = result?.path === path && result.revision === revision;
  const failed = failure?.path === path && failure.revision === revision;
  return {
    data: result?.path === path ? result.data : undefined,
    error: failed ? failure.error : undefined,
    loading: !current && !failed,
    refresh,
  };
}
