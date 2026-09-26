"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { Icon, type IconName } from "@/ui/icon";

/** Explains where a block's content is owned without leaving the page draft. */
export function ConnectedSource({
  name,
  icon,
  description,
  status = "Connected content",
  tone = "neutral",
  enabled = true,
  href,
  action,
  onRefresh,
  children,
}: {
  name: string;
  icon: IconName;
  description: string;
  status?: string;
  tone?: "neutral" | "ready" | "attention";
  enabled?: boolean;
  href?: string;
  action?: string;
  onRefresh?: () => void;
  children?: ReactNode;
}) {
  const { capabilities } = useCurrentUser();
  const destination = enabled
    ? href
    : capabilities.includes("integrations.manage")
      ? "/admin/integrations"
      : undefined;
  return (
    <section
      className="editor-connected-source"
      aria-label={`${name} connection`}
    >
      <div className="editor-connected-heading">
        <span className="editor-connected-icon">
          <Icon name={icon} />
        </span>
        <div>
          <small>Connected source</small>
          <strong>{name}</strong>
        </div>
      </div>
      <span
        className={`editor-connection-status is-${enabled ? tone : "attention"}`}
      >
        {enabled ? status : "Feature disabled"}
      </span>
      <p>
        {enabled
          ? description
          : `${name} is disabled in Integrations. This block keeps its settings. An administrator can enable it there.`}
      </p>
      {enabled && children}
      {(destination || (enabled && onRefresh)) && (
        <div className="editor-connection-actions">
          {destination && (
            <Link href={destination} target="_blank" rel="noopener noreferrer">
              {enabled ? (action ?? `Open ${name}`) : "Open Integrations"}
              <Icon name="external" width={14} height={14} />
            </Link>
          )}
          {enabled && onRefresh && (
            <button type="button" onClick={onRefresh}>
              Refresh
            </button>
          )}
        </div>
      )}
      {destination && (
        <small className="editor-connection-tab-note">
          Opens in a new tab. Your page draft stays here.
        </small>
      )}
    </section>
  );
}

export function ConnectionError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="editor-connection-error" role="alert">
      <p>{error}</p>
      <button type="button" className="inline-button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
