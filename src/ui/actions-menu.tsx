"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icon";

/** A compact disclosure of ordinary links/buttons, with native keyboard navigation. */
export function ActionsMenu({
  label,
  children,
  disabled = false,
  trigger,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  trigger?: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent | FocusEvent) {
      const menu = ref.current;
      if (
        !menu ||
        document.querySelector("dialog[open]") ||
        menu.querySelector('[aria-busy="true"]')
      )
        return;
      if (event.target instanceof Node && !menu.contains(event.target))
        menu.open = false;
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
    };
  }, []);
  return (
    <details
      className="actions-menu"
      ref={ref}
      onKeyDown={(event) => {
        if (
          event.key !== "Escape" ||
          document.querySelector("dialog[open]") ||
          ref.current?.querySelector('[aria-busy="true"]')
        )
          return;
        event.preventDefault();
        if (ref.current) {
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        aria-label={label}
        aria-disabled={disabled || undefined}
        title={label}
        onClick={(event) => {
          if (
            disabled ||
            document.querySelector("dialog[open]") ||
            ref.current?.querySelector('[aria-busy="true"]')
          )
            event.preventDefault();
        }}
      >
        {trigger ?? <Icon name="more" />}
      </summary>
      <div
        className="actions-menu-options"
        role="group"
        aria-label={`${label} options`}
      >
        {children}
      </div>
    </details>
  );
}
