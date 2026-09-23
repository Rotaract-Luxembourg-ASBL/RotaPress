import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Icon, type IconName } from "@/ui/icon";
import { StatusBadge } from "@/ui/collection";

/** Shared presentation for built-in features and external connections. */
export function IntegrationCard({
  name,
  category,
  description,
  icon,
  enabled,
  state,
  connection,
  settingsHref,
  settingsLabel = "Configure",
  children,
}: {
  name: string;
  category: string;
  description: string;
  icon: IconName;
  enabled?: boolean;
  state: string;
  connection: ReactNode;
  settingsHref?: string;
  settingsLabel?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <article className="integration-card" aria-labelledby={titleId}>
      <div className="integration-card-top">
        <span className="integration-card-icon">
          <Icon name={icon} width="28" height="28" />
        </span>
        <StatusBadge tone={enabled ? "success" : "neutral"}>
          {state}
        </StatusBadge>
      </div>
      <div className="integration-card-copy">
        <p className="integration-category">{category}</p>
        <h2 id={titleId}>{name}</h2>
        <p className="muted">{description}</p>
      </div>
      <div className="integration-card-connection">{connection}</div>
      <div className="integration-card-actions">
        {children}
        {settingsHref && (
          <Link
            href={settingsHref}
            className="button button-outline"
            aria-label={`${settingsLabel} ${name}`}
          >
            {settingsLabel}
            <Icon name="controls" width="16" height="16" />
          </Link>
        )}
      </div>
    </article>
  );
}
