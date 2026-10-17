"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./icon";

export function MediaAttachmentDialog({
  title,
  children,
  onClose,
  canClose,
  onPrevious,
  onNext,
  position,
  busy,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  canClose: () => boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  position?: string;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const trigger = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    closeButton.current?.focus();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  function dismiss() {
    if (canClose()) onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="media-dialog media-attachment-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        dismiss();
      }}
      onKeyDown={(event) => {
        if (
          busy ||
          event.defaultPrevented ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          (event.target instanceof HTMLElement &&
            event.target.closest(
              "input,textarea,select,[contenteditable=true],[data-media-editor]",
            ))
        )
          return;
        if (event.key === "ArrowLeft" && onPrevious) {
          event.preventDefault();
          onPrevious();
        }
        if (event.key === "ArrowRight" && onNext) {
          event.preventDefault();
          onNext();
        }
      }}
    >
      <div className="media-attachment-shell">
        <header className="media-dialog-header">
          <h2 id={titleId}>{title}</h2>
          <div className="media-attachment-navigation">
            {position && <span role="status">{position}</span>}
            {(onPrevious || onNext || position) && (
              <>
                <button
                  type="button"
                  className="media-close"
                  disabled={busy || !onPrevious}
                  onClick={onPrevious}
                  aria-label="Previous file"
                >
                  <Icon name="back" />
                </button>
                <button
                  type="button"
                  className="media-close media-next"
                  disabled={busy || !onNext}
                  onClick={onNext}
                  aria-label="Next file"
                >
                  <Icon name="back" />
                </button>
              </>
            )}
            <button
              ref={closeButton}
              type="button"
              className="media-close"
              disabled={busy}
              onClick={dismiss}
              aria-label="Close dialog"
            >
              <Icon name="close" />
            </button>
          </div>
        </header>
        <div className="media-attachment-content">{children}</div>
      </div>
    </dialog>
  );
}
