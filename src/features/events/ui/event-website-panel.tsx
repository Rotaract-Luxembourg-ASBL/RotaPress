"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { request, errorMessage, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import type { CmsDetail, CmsLocale, CmsSummary } from "../../cms/cms_schemas";
import type { EventDraft } from "../event_schemas";
import {
  eventModules,
  eventPageModuleKeySchema,
  type EventModuleKey,
  type EventModuleState,
} from "../event_modules";
import { EventPageCard } from "./event-page-card";
import { EventPageEditor } from "./event-page-editor";
import { eventLayouts } from "../event_layouts";
import { EventLayoutPicker } from "./event-layout-picker";

type Workspace = {
  modules: EventModuleState[];
  pages: CmsSummary[];
  publishedAt: string | null;
  publishedVisibility: string | null;
};
export function EventWebsitePanel({
  event,
  disabled,
  onSaved,
  onPagesChanged,
  onDirtyChange,
  active,
  initialPageId,
  initialLocale = "en",
}: {
  event: EventDraft;
  disabled: boolean;
  onSaved: (event: EventDraft) => void;
  onPagesChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  active: boolean;
  initialPageId?: string;
  initialLocale?: CmsLocale;
}) {
  const { data, error, refresh } = useResource<Workspace>(
    `/api/admin/events/${event.id}/website`,
  );
  useEffect(() => {
    refresh();
    window.addEventListener("event-pages-updated", refresh);
    return () => window.removeEventListener("event-pages-updated", refresh);
  }, [event.version, refresh]);
  const [locale, setLocale] = useState<CmsLocale>(initialLocale);
  const [pageId, setPageId] = useState(initialPageId);
  const [busy, setBusy] = useState(false);
  const [websiteRecipe, setWebsiteRecipe] = useState("event-layout:reference");
  const [choosingLayout, setChoosingLayout] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [pageDirty, setPageDirty] = useState(false);
  const markDirty = useCallback(
    (dirty: boolean) => {
      setPageDirty(dirty);
      onDirtyChange(dirty);
    },
    [onDirtyChange],
  );
  const locked = disabled || busy || event.archived || event.cancelled;
  const websiteEnabled = Boolean(
    data?.modules.some(
      (module) => module.key === "website" && module.state === "enabled",
    ),
  );
  const pages =
    data?.pages.filter((page) => !page.archived && page.locale === locale) ??
    [];
  const page = pageId
    ? pages.find((item) => item.id === pageId)
    : pages.find((item) => item.moduleKey === "website");
  const selectedPageId = page?.id;
  const pageState = data?.modules.find(
    (module) => module.key === page?.moduleKey,
  )?.state;
  const canLeave = () =>
    !pageDirty || window.confirm("Leave without saving your page changes?");

  useEffect(() => {
    if (!active || !selectedPageId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "website");
    url.searchParams.set("page", selectedPageId);
    url.searchParams.set("locale", locale);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [active, selectedPageId, locale]);

  async function mutate(path: string, body: object) {
    setBusy(true);
    setProblem(undefined);
    try {
      onSaved(
        await request<EventDraft>(`/api/admin/events/${event.id}/${path}`, {
          method: "POST",
          body: JSON.stringify({ ...body, expectedVersion: event.version }),
        }),
      );
      refresh();
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function change(key: EventModuleKey, enable: boolean) {
    const dependents =
      !enable &&
      key === "website" &&
      data?.modules.some(
        (item) => item.key !== "website" && item.state === "enabled",
      );
    if (
      !window.confirm(
        enable
          ? `Enable ${eventModules[key].label} for this event? Retained published content becomes available again if the event is published.`
          : `Disable ${eventModules[key].label}? ${dependents ? "All active dependent features will also be suspended. " : ""}Public access stops immediately. Content and history are retained.`,
      )
    )
      return;
    await mutate("modules", {
      key,
      operation: enable ? "enable" : "disable",
      suspendDependents: Boolean(dependents),
      confirmed: true,
    });
  }
  async function create(key: EventModuleKey) {
    setBusy(true);
    setProblem(undefined);
    const existing = data?.pages.find(
      (item) => item.moduleKey === key && !item.archived,
    );
    try {
      const created = await request<CmsDetail>(
        existing
          ? `/api/admin/cms/content/${existing.id}/locale`
          : "/api/admin/cms/content",
        {
          method: "POST",
          body: JSON.stringify({
            locale,
            title: event.title,
            slug: key,
            ...(existing
              ? {}
              : {
                  kind: "page",
                  templateId: key === "website" ? websiteRecipe : "blank",
                  event: { id: event.id, moduleKey: key },
                }),
          }),
        },
      );
      setPageId(created.id);
      refresh();
      onPagesChanged();
      window.dispatchEvent(new Event("event-pages-updated"));
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function renderPage(module: EventModuleState) {
    return (
      <EventPageCard
        key={module.key}
        event={event}
        module={module}
        page={pages.find((item) => item.moduleKey === module.key)}
        locale={locale}
        locked={locked || pageDirty}
        navigationLocked={disabled || busy || pageDirty}
        websiteEnabled={websiteEnabled}
        published={Boolean(data?.publishedAt)}
        onCreate={() => void create(module.key)}
        onChange={(enable) => void change(module.key, enable)}
      >
        <div className="form-stack">
          <label>
            Starting layout
            <select
              value={websiteRecipe}
              onChange={(e) => setWebsiteRecipe(e.target.value)}
              disabled={locked}
            >
              {eventLayouts.map((layout) => (
                <option key={layout.id} value={`event-layout:${layout.id}`}>
                  {layout.name}
                </option>
              ))}
              <option value="blank">Blank page — choose each section</option>
              <option value="rotary-service:event-detail">
                Rotary Template event detail
              </option>
              <option value="rotaract-action:event-detail">
                Rotaract Template event detail
              </option>
            </select>
            <span className="field-help">
              Ready-made examples with editable sections, colours and
              typography.
            </span>
          </label>
          <button
            type="button"
            className="button button-outline"
            disabled={locked}
            onClick={() => setChoosingLayout(true)}
          >
            Browse 10 layouts
          </button>
        </div>
      </EventPageCard>
    );
  }
  return (
    <section
      className="event-website-panel"
      aria-label="Event website and features"
    >
      <div className="event-page-switcher">
        <label>
          Page language
          <select
            value={locale}
            onChange={(e) => {
              if (canLeave()) {
                setPageId(undefined);
                setLocale(e.target.value as CmsLocale);
              }
            }}
          >
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="lb">Luxembourgish</option>
          </select>
        </label>
        {pages.length > 1 && (
          <label>
            Page
            <select
              value={page?.id ?? ""}
              onChange={(e) => {
                if (canLeave()) setPageId(e.target.value);
              }}
            >
              {pages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.moduleKey === "website"
                    ? "Main event page"
                    : item.moduleKey
                      ? eventModules[item.moduleKey].label
                      : item.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {data?.publishedAt && page?.publishedRevisionId && websiteEnabled && (
          <Link
            className="text-link"
            href={`/events/${event.slug}/${locale}/${page.moduleKey}`}
            target="_blank"
          >
            View published page ↗
          </Link>
        )}
      </div>
      {(error || problem) && (
        <Notice>
          {problem || error}
          <button type="button" className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {choosingLayout && (
        <EventLayoutPicker
          onClose={() => setChoosingLayout(false)}
          onSelect={(id) => {
            setWebsiteRecipe(`event-layout:${id}`);
            setChoosingLayout(false);
          }}
        />
      )}
      {!data ? (
        <Loading />
      ) : (
        <>
          {page ? (
            <EventPageEditor
              key={`${page.id}:${locale}:${pageState}`}
              eventId={event.id}
              pageId={page.id}
              locale={locale}
              locked={locked || !websiteEnabled || pageState !== "enabled"}
              active={active}
              onDirtyChange={markDirty}
              onEventSaved={onSaved}
            />
          ) : pageId ? (
            <div className="event-page-start">
              <p role="status">Opening the selected page…</p>
              <button
                type="button"
                className="inline-button"
                onClick={() => setPageId(undefined)}
              >
                Return to the main event page
              </button>
            </div>
          ) : (
            <div className="event-page-start">
              {data.modules
                .filter((module) => module.key === "website")
                .map(renderPage)}
            </div>
          )}
          <details className="event-page-availability">
            <summary>Page languages & availability</summary>
            <p role="status">
              {data.publishedAt
                ? `Event details published · ${data.publishedVisibility}. Draft edits stay private until published.`
                : "This event is a private draft. Use Publish changes above when your page is ready."}
            </p>
            {page &&
              data.modules
                .filter((module) => module.key === "website")
                .map(renderPage)}
            <h3>Additional pages</h3>
            <p className="field-help">
              For a separate gallery or sponsor page. You can also add these
              sections to the main page.
            </p>
            {data.modules
              .filter(
                (module) =>
                  module.key !== "website" &&
                  eventPageModuleKeySchema.safeParse(module.key).success,
              )
              .map(renderPage)}
            {data.publishedAt &&
              event.capabilities.includes("events.publish") && (
                <button
                  type="button"
                  className="button button-outline"
                  disabled={locked || pageDirty}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Unpublish this event? All public event pages will stop being available. Content is retained.",
                      )
                    )
                      void mutate("publication", {
                        operation: "unpublish",
                        confirmed: true,
                      });
                  }}
                >
                  Unpublish event
                </button>
              )}
          </details>
        </>
      )}
    </section>
  );
}
