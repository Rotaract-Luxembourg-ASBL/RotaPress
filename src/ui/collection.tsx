import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

type SummaryItem = {
  label: string;
  value: number;
  hint: string;
  icon?: IconName;
  onClick?: () => void;
  selected?: boolean;
};

/** Counts describe the loaded, authorized collection, never sample analytics. */
export function SummaryStats({
  label,
  items,
}: {
  label: string;
  items: SummaryItem[];
}) {
  return (
    <section className="admin-stats" aria-label={label}>
      {items.map((item) => {
        const content = (
          <>
            <span className="admin-stat-label">
              {item.label}
              {item.icon && <Icon name={item.icon} />}
            </span>
            <strong>{item.value}</strong>
            <span className="admin-stat-hint">{item.hint}</span>
          </>
        );
        return item.onClick ? (
          <button
            key={item.label}
            type="button"
            className="admin-stat"
            onClick={item.onClick}
            aria-pressed={item.selected}
          >
            {content}
          </button>
        ) : (
          <div key={item.label} className="admin-stat">
            {content}
          </div>
        );
      })}
    </section>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <span className={`admin-status admin-status-${tone}`}>{children}</span>
  );
}

export function FilterTabs<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
}) {
  return (
    <div className="admin-filter-tabs" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function CollectionToolbar({
  searchLabel,
  query,
  onQuery,
  children,
}: {
  searchLabel: string;
  query: string;
  onQuery: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="admin-collection-search">
      <label className="admin-search">
        <Icon name="search" />
        <input
          type="search"
          aria-label={searchLabel}
          placeholder={`${searchLabel}…`}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      {children}
    </div>
  );
}

export function Collection({
  label,
  noun,
  detailLabel,
  toolbar,
  children,
  footer,
}: {
  label: string;
  noun: string;
  detailLabel: string;
  toolbar: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="admin-collection" aria-label={label}>
      <div className="admin-collection-toolbar">{toolbar}</div>
      <div className="admin-collection-columns" aria-hidden="true">
        <span>{noun}</span>
        <span>Status</span>
        <span>{detailLabel}</span>
        <span>Actions</span>
      </div>
      {children}
      {footer && (
        <div className="admin-collection-footer" role="status">
          {footer}
        </div>
      )}
    </section>
  );
}

export function CollectionRow({
  title,
  description,
  icon,
  status,
  detail,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  status: ReactNode;
  detail: { label: string; value: ReactNode };
  actions: ReactNode;
}) {
  return (
    <li className="admin-collection-row">
      <div className="admin-collection-identity">
        {icon && <span className="admin-collection-icon">{icon}</span>}
        <div>
          <div className="admin-collection-title">{title}</div>
          {description && (
            <div className="admin-collection-description">{description}</div>
          )}
        </div>
      </div>
      <div className="admin-collection-status">{status}</div>
      <div className="admin-collection-detail">
        <span className="admin-detail-label">{detail.label}</span>
        {detail.value}
      </div>
      <div className="admin-collection-actions">{actions}</div>
    </li>
  );
}

export function CollectionEmpty({
  icon,
  title,
  description,
  children,
}: {
  icon: IconName;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="admin-collection-empty">
      <span className="admin-collection-icon">
        <Icon name={icon} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}

export function UpdatedDate({ value }: { value: string }) {
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}
    </time>
  );
}
