"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./icon";

/** Native modal focus containment, Escape handling and focus return. */
export function Dialog({
  title,
  children,
  onClose,
  canClose = () => true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  canClose?: () => boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  function dismiss() {
    if (canClose()) onClose();
  }
  return (
    <dialog
      ref={ref}
      className="admin-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <header className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="button button-outline button-small"
          onClick={dismiss}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
