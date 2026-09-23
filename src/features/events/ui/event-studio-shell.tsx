"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Icon } from "@/ui/icon";

export function EventStudioShell({
  title,
  status,
  actions,
  navigation,
  children,
  backHref = "/admin/events",
  backLabel = "Back to events",
  onBack,
  onBeforeNavigate,
}: {
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
  navigation: ReactNode;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  onBack?: () => boolean;
  onBeforeNavigate?: () => boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className="event-studio"
      onClickCapture={(event) => {
        if (!onBeforeNavigate || !(event.target instanceof Element)) return;
        const link = event.target.closest<HTMLAnchorElement>("a[href]");
        if (
          !link ||
          link.classList.contains("event-studio-back") ||
          link.target === "_blank" ||
          link.hasAttribute("download")
        )
          return;
        if (!onBeforeNavigate()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <aside className={`event-studio-sidebar${menuOpen ? " is-open" : ""}`}>
        <div className="event-studio-back-row">
          <Link
            className="event-studio-back"
            href={backHref}
            onClick={(event) => {
              if (onBack && !onBack()) event.preventDefault();
            }}
          >
            <Icon name="back" />
            {backLabel}
          </Link>
          <button
            type="button"
            className="event-studio-close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="event-studio-brand">
          <span className="event-studio-mark">
            <Icon name="calendar" />
          </span>
          <div>
            <strong>Event workspace</strong>
            <span>RotaPress</span>
          </div>
        </div>
        <div
          id="event-studio-navigation"
          className="event-studio-navigation"
          onClick={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("button, a")
            )
              setMenuOpen(false);
          }}
        >
          {navigation}
        </div>
      </aside>
      <header className="event-studio-topbar">
        <button
          type="button"
          className="button button-outline event-studio-menu"
          aria-expanded={menuOpen}
          aria-controls="event-studio-navigation"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <Icon name="outline" /> Menu
        </button>
        <div className="event-studio-heading">
          <h1>{title}</h1>
          {status && <div className="event-studio-status">{status}</div>}
        </div>
        {actions && <div className="event-studio-actions">{actions}</div>}
      </header>
      <main id="main-content" className="event-studio-content">
        {children}
      </main>
    </div>
  );
}
