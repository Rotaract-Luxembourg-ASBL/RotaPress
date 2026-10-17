"use client";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { ApiError, errorMessage, request } from "@/ui/api";
import type { EditorCheckpoint } from "../cms_workspace_schemas";
import { EditorCheckpointSession } from "./editor-checkpoint-session";

/** Recovery is private server state, not a new published or saved page revision. */
export function useEditorCheckpoint({
  base,
  locale,
  payload,
  enabled,
  dirty,
}: {
  base: string;
  locale: string;
  payload: object;
  enabled: boolean;
  dirty: boolean;
}) {
  const session = useMemo(
    () =>
      new EditorCheckpointSession({
        read: async () =>
          (
            await request<{ checkpoint: EditorCheckpoint | null }>(
              `${base}/checkpoint?locale=${encodeURIComponent(locale)}`,
            )
          ).checkpoint,
        save: async (body, version) =>
          (
            await request<{ checkpoint: EditorCheckpoint }>(
              `${base}/checkpoint`,
              {
                method: "POST",
                body: JSON.stringify({
                  ...(JSON.parse(body) as object),
                  expectedCheckpointVersion: version,
                }),
              },
            )
          ).checkpoint,
        discard: async (version) => {
          await request(`${base}/discard-checkpoint`, {
            method: "POST",
            body: JSON.stringify({
              locale,
              expectedCheckpointVersion: version,
            }),
          });
        },
        describeError: errorMessage,
        isConflict: (cause) =>
          cause instanceof ApiError && cause.status === 409,
      }),
    [base, locale],
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const serialized = JSON.stringify(payload);
  const latest = useRef(serialized);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    latest.current = serialized;
  }, [serialized]);
  useEffect(() => {
    enabledRef.current = enabled;
    session.setEnabled(enabled);
    return () => session.pause();
  }, [session, enabled]);
  useEffect(() => {
    void session.load();
  }, [session]);
  useEffect(() => {
    if (!enabled || !dirty || !state.ready || state.candidate || state.blocked)
      return;
    const timer = window.setTimeout(
      () => void session.retain(serialized),
      1800,
    );
    return () => window.clearTimeout(timer);
  }, [
    enabled,
    dirty,
    state.ready,
    state.candidate,
    state.blocked,
    serialized,
    session,
  ]);
  return {
    ...state,
    reload: session.load,
    recover: session.recover,
    discard: async () => {
      try {
        await session.discard();
      } finally {
        session.setEnabled(enabledRef.current);
      }
    },
    settle: () => session.settle(),
    retry: () => {
      void session.retain(latest.current);
    },
  };
}
