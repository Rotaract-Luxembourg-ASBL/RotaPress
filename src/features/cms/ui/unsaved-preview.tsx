"use client";

import { useEffect, useRef, useState } from "react";
import { request, errorMessage } from "@/ui/api";

/** Keep the editor mounted: selection, tabs, undo history and scroll never get replaced. */
export function UnsavedPreview({
  endpoint,
  payload,
  disabled = false,
  inline = false,
  focusId,
  fullScreen = false,
  onFullScreenChange,
}: {
  endpoint: string;
  payload: object;
  disabled?: boolean;
  inline?: boolean;
  focusId?: string;
  fullScreen?: boolean;
  onFullScreenChange?: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<"closed" | "side" | "full">("closed");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [inlineWidth, setInlineWidth] = useState(360);
  const serialized = JSON.stringify(payload);
  const active = inline || mode !== "closed";
  useEffect(() => {
    if (!inline || fullScreen || !stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setInlineWidth(Math.max(1, entry.contentRect.width));
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [inline, fullScreen]);
  useEffect(() => {
    if (!active) return;
    let current = true;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        const result = await request<{ url: string }>(endpoint, {
          method: "POST",
          body: serialized,
        });
        if (current) setUrl(result.url);
      } catch (cause) {
        if (current) {
          setError(errorMessage(cause));
          setUrl("");
        }
      } finally {
        if (current) setBusy(false);
      }
    }, 700);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [active, endpoint, serialized, retry]);
  useEffect(() => {
    if (mode === "full" || fullScreen) {
      const focused = document.activeElement;
      dialog.current?.showModal();
      return () => {
        if (focused instanceof HTMLElement && focused.isConnected)
          focused.focus();
      };
    }
  }, [mode, fullScreen]);
  function close() {
    if (fullScreen) {
      onFullScreenChange?.(false);
      return;
    }
    setMode("closed");
    trigger.current?.focus({ preventScroll: true });
  }
  const controls = (
    <>
      <header className="unsaved-preview-toolbar">
        <div>
          <strong>Preview changes</strong>
          <span>
            {inline && !fullScreen && device === "desktop"
              ? "Desktop at 1280px · Private preview"
              : "Private · Nothing saved or published"}
          </span>
        </div>
        <div className="unsaved-preview-actions">
          <button
            type="button"
            aria-pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
          >
            Desktop
          </button>
          <button
            type="button"
            aria-pressed={device === "phone"}
            onClick={() => setDevice("phone")}
          >
            Phone
          </button>
          {!inline && (
            <button
              type="button"
              className="preview-mode-button"
              onClick={() => setMode(mode === "full" ? "side" : "full")}
            >
              {mode === "full" ? "Beside editor" : "Full preview"}
            </button>
          )}
          {(!inline || fullScreen) && (
            <button type="button" onClick={close}>
              Back to editor
            </button>
          )}
        </div>
      </header>
      <div className="unsaved-preview-status" role="status">
        {error ||
          (busy
            ? "Updating preview…"
            : "Current unsaved input. Links show their normal destination.")}
        {error && (
          <button type="button" onClick={() => setRetry(retry + 1)}>
            Try again
          </button>
        )}
      </div>
      <div ref={stage} className="unsaved-preview-stage" data-device={device}>
        {url && !error ? (
          <iframe
            title="Unsaved website preview"
            src={`${url}${focusId ? `#${encodeURIComponent(focusId)}` : ""}`}
            style={
              inline && !fullScreen && device === "desktop"
                ? {
                    width: 1280,
                    height: Math.ceil((520 * 1280) / inlineWidth),
                    maxWidth: "none",
                    transform: `scale(${inlineWidth / 1280})`,
                    transformOrigin: "top left",
                  }
                : undefined
            }
            key={url}
            onLoad={() => setBusy(false)}
          />
        ) : (
          !error && <p>Preparing private preview…</p>
        )}
      </div>
    </>
  );
  if (fullScreen)
    return (
      <dialog
        ref={dialog}
        className="unsaved-preview-dialog"
        aria-label="Preview changes"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        {controls}
      </dialog>
    );
  if (inline)
    return (
      <aside className="event-live-preview" aria-label="Live event preview">
        {controls}
      </aside>
    );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="button button-outline button-small"
        disabled={disabled}
        onClick={() => {
          if (mode === "closed") setUrl("");
          setMode("full");
        }}
      >
        Preview changes
      </button>
      {mode === "side" && (
        <aside
          className="unsaved-preview-panel"
          aria-label="Preview beside editor"
        >
          {controls}
        </aside>
      )}
      {mode === "full" && (
        <dialog
          ref={dialog}
          className="unsaved-preview-dialog"
          aria-label="Preview changes"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          {controls}
        </dialog>
      )}
    </>
  );
}
