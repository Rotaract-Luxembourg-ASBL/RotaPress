import Link from "next/link";
import type { ReactNode } from "react";
import type { CmsLocale, CmsSummary } from "../../cms/cms_schemas";
import type { EventDraft } from "../event_schemas";
import { eventModules, type EventModuleState } from "../event_modules";
import { eventPageEditorHref } from "../event_routes";

export function EventPageCard({
  event,
  module,
  page,
  locale,
  locked,
  navigationLocked,
  websiteEnabled,
  published,
  onCreate,
  onChange,
  children,
}: {
  event: EventDraft;
  module: EventModuleState;
  page?: CmsSummary;
  locale: CmsLocale;
  locked: boolean;
  navigationLocked: boolean;
  websiteEnabled: boolean;
  published: boolean;
  onCreate: () => void;
  onChange: (enable: boolean) => void;
  children?: ReactNode;
}) {
  const main = module.key === "website";
  const enabled = module.state === "enabled";
  const canEdit =
    enabled &&
    !event.cancelled &&
    !event.archived &&
    event.capabilities.includes("events.edit");
  const requiresWebsite = !main && !websiteEnabled;
  const pageState = !enabled
    ? module.state === "suspended"
      ? "Paused"
      : "Off"
    : !page
      ? "Page needed"
      : !page.publishedRevisionId
        ? "Draft"
        : page.draftRevisionId !== page.publishedRevisionId
          ? "Unpublished changes"
          : "Published page";
  return (
    <article
      className={main ? "event-main-page" : "event-page-row"}
      aria-label={`${eventModules[module.key].label} feature`}
    >
      <div className="event-page-heading">
        <div>
          <h3>{main ? "Main event page" : eventModules[module.key].label}</h3>
          <p className="field-help">
            {main
              ? "Design the page visitors see: introduction, programme, images and useful links."
              : eventModules[module.key].description}
          </p>
        </div>
        <span className="badge">{pageState}</span>
      </div>
      {main && enabled && !page && canEdit && children}
      {enabled && !page && (
        <p className="field-help">
          No {locale.toUpperCase()} page yet.{" "}
          {canEdit
            ? "Create a draft to start editing."
            : "Ask an event editor to create a page."}
        </p>
      )}
      {requiresWebsite && <p className="field-help">Enable Website first.</p>}
      {module.state === "suspended" && websiteEnabled && (
        <p className="field-help">
          Content is saved. Enable this page to make it available again.
        </p>
      )}
      <div className="event-page-actions">
        {page && (
          <Link
            className={`button ${main && canEdit ? "button-accent" : "button-outline"} button-small`}
            href={eventPageEditorHref(event.id, page.id, locale)}
            aria-disabled={navigationLocked}
            onClick={(e) => {
              if (navigationLocked) e.preventDefault();
            }}
          >
            {canEdit ? "Edit page" : "View retained page"}
          </Link>
        )}
        {!page && canEdit && (
          <button
            type="button"
            className={`button ${main ? "button-accent" : "button-outline"} button-small`}
            disabled={locked}
            onClick={onCreate}
          >
            Create {locale.toUpperCase()} page
          </button>
        )}
        {published && enabled && page?.publishedRevisionId && (
          <Link
            className="inline-button"
            href={`/events/${event.slug}/${locale}/${module.key}`}
            target="_blank"
          >
            View website ↗
          </Link>
        )}
        {event.capabilities.includes("events.modules.manage") &&
          !event.archived && (
            <button
              type="button"
              className={
                enabled ? "inline-button" : "button button-outline button-small"
              }
              disabled={locked || (!enabled && requiresWebsite)}
              onClick={() => onChange(!enabled)}
            >
              {enabled ? "Disable" : "Enable"} {eventModules[module.key].label}
            </button>
          )}
      </div>
    </article>
  );
}
