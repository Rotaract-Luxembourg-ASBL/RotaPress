"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { AdminDestination } from "./admin-navigation";
import { Dialog } from "./dialog";
import { Icon } from "./icon";

export function AdminCommandLauncher({
  destinations,
  floating = false,
}: {
  destinations: AdminDestination[];
  floating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = destinations.filter((item) =>
    words.every((word) =>
      `${item.label} ${item.group} ${item.keywords ?? ""}`
        .toLocaleLowerCase()
        .includes(word),
    ),
  );
  useEffect(() => {
    function shortcut(event: globalThis.KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k")
        return;
      // Respect a media/editor task already using the native modal top layer.
      if (!open && document.querySelector("dialog[open]")) return;
      event.preventDefault();
      setQuery("");
      setOpen((value) => !value);
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [open]);
  function navigateResults(event: KeyboardEvent) {
    const links = Array.from(
      list.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [],
    );
    if (!links.length) return;
    const current = links.findIndex((link) => link === document.activeElement);
    let next: number;
    if (event.key === "ArrowDown") next = (current + 1) % links.length;
    else if (event.key === "ArrowUp")
      next = current <= 0 ? links.length - 1 : current - 1;
    else return;
    event.preventDefault();
    links[next]?.focus();
  }
  return (
    <div
      className={
        floating ? "admin-command admin-command-floating" : "admin-command"
      }
    >
      <button
        type="button"
        className="admin-command-trigger"
        aria-label="Search administration"
        aria-haspopup="dialog"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
      >
        <Icon name="search" width={18} height={18} />
        <span>Search or jump to…</span>
        <kbd>Ctrl K</kbd>
      </button>
      {open && (
        <Dialog
          title="Search administration"
          onClose={() => setOpen(false)}
          initialFocusRef={search}
        >
          <div className="admin-command-content" onKeyDown={navigateResults}>
            <label className="admin-command-search" htmlFor={id}>
              Find a workspace or task
            </label>
            <input
              id={id}
              ref={search}
              type="search"
              value={query}
              placeholder="Try pages, photos, members or AI…"
              aria-controls={`${id}-results`}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  list.current?.querySelector<HTMLAnchorElement>("a")?.click();
                }
              }}
            />
            <p className="sr-only" role="status">
              {matches.length} destinations
            </p>
            <ul
              id={`${id}-results`}
              ref={list}
              className="admin-command-results"
              aria-label="Search results"
            >
              {matches.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setOpen(false)}>
                    <Icon name={item.icon} />
                    <span>
                      {item.label}
                      <small>{item.group || "Workspace"}</small>
                    </span>
                    <Icon name="external" width={14} height={14} />
                  </Link>
                </li>
              ))}
            </ul>
            {!matches.length && (
              <p className="admin-command-empty">
                No matching workspace. Try another name.
              </p>
            )}
            <p className="field-help">
              Use ↑ ↓ to choose, Enter to open, and Escape to close.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
