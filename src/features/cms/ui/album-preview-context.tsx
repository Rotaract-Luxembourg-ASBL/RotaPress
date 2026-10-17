"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AlbumPreviewState = {
  versions: Record<string, number>;
  refresh: (albumId: string) => void;
};
const AlbumPreviewContext = createContext<AlbumPreviewState | null>(null);

/** Inspector actions refresh linked previews without changing saved content. */
export function AlbumPreviewProvider({ children }: { children: ReactNode }) {
  const [versions, setVersions] = useState<Record<string, number>>({});
  const refresh = useCallback((albumId: string) => {
    setVersions((current) => ({
      ...current,
      [albumId]: (current[albumId] ?? 0) + 1,
    }));
  }, []);
  const value = useMemo(() => ({ versions, refresh }), [versions, refresh]);
  return (
    <AlbumPreviewContext.Provider value={value}>
      {children}
    </AlbumPreviewContext.Provider>
  );
}

export function useAlbumPreviewRefresh(albumId?: string) {
  const context = useContext(AlbumPreviewContext);
  if (!context)
    throw new Error("Album previews require their editor provider.");
  return {
    version: albumId ? (context.versions[albumId] ?? 0) : 0,
    refresh: () => {
      if (albumId) context.refresh(albumId);
    },
  };
}
