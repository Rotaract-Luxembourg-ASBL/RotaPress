"use client";

import type { AdminMediaAssetDto } from "@/features/media/media_schemas";
import { useRequestResource } from "./request-resource";

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
  return useRequestResource<MediaCollection>(path);
}
