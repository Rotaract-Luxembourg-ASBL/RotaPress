"use client";

import { useCallback, useRef, useState } from "react";
import type { AppState, Data, OnAction, PuckAction } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";

type Snapshot = AppState<Data<PuckBlocks>>;
type Dispatch = (action: PuckAction) => void;

// Puck 0.23 debounces structural actions together with typing. Public onAction
// snapshots let rapid insert/move/duplicate operations keep distinct undo steps.
// Only same-field edits coalesce; restoring uses the supported set action.
export function useEditorHistory() {
  const snapshots = useRef<Snapshot[]>([]);
  const index = useRef(-1);
  const lastEdit = useRef<{ key: string; time: number } | null>(null);
  const [available, setAvailable] = useState({
    hasPast: false,
    hasFuture: false,
  });

  const reset = useCallback(() => {
    snapshots.current = [];
    index.current = -1;
    lastEdit.current = null;
    setAvailable({ hasPast: false, hasFuture: false });
  }, []);

  const onAction: OnAction<Data<PuckBlocks>> = useCallback(
    (action, next, previous) => {
      if (
        action.recordHistory === false ||
        ["set", "setUi", "setData", "registerZone", "unregisterZone"].includes(
          action.type,
        ) ||
        JSON.stringify(next.data) === JSON.stringify(previous.data)
      )
        return;

      let editKey: string | null = null;
      if (action.type === "replace") {
        const before = previous.data.content
          .flatMap((block) =>
            block.type === "SiteRow"
              ? [
                  block,
                  ...block.props.left,
                  ...block.props.center,
                  ...block.props.right,
                ]
              : [block],
          )
          .find((block) => block.props.id === action.data.props.id);
        const changed = Object.keys(action.data.props).filter(
          (key) =>
            JSON.stringify(Reflect.get(before?.props ?? {}, key)) !==
            JSON.stringify(action.data.props[key]),
        );
        editKey = `${action.data.props.id}:${changed.sort().join(",")}`;
      }

      const now = Date.now();
      const coalesce =
        editKey !== null &&
        lastEdit.current?.key === editKey &&
        now - lastEdit.current.time < 500 &&
        index.current === snapshots.current.length - 1;
      let entries = snapshots.current.slice(0, index.current + 1);
      if (!entries.length) entries = [previous];
      // Preserve the current selection when stepping back from this operation.
      if (!coalesce) entries[entries.length - 1] = previous;
      if (coalesce) entries[entries.length - 1] = next;
      else entries.push(next);
      snapshots.current = entries.slice(-100);
      index.current = snapshots.current.length - 1;
      lastEdit.current = editKey ? { key: editKey, time: now } : null;
      setAvailable({ hasPast: index.current > 0, hasFuture: false });
    },
    [],
  );

  const step = useCallback((offset: number, dispatch: Dispatch) => {
    const nextIndex = index.current + offset;
    const snapshot = snapshots.current[nextIndex];
    if (!snapshot) return;
    index.current = nextIndex;
    lastEdit.current = null;
    dispatch({
      type: "set",
      state: {
        data: snapshot.data,
        ui: {
          ...snapshot.ui,
          isDragging: false,
          field: { ...snapshot.ui.field, focus: null },
        },
      },
      recordHistory: false,
    });
    setAvailable({
      hasPast: nextIndex > 0,
      hasFuture: nextIndex < snapshots.current.length - 1,
    });
  }, []);

  return { ...available, onAction, reset, step };
}
