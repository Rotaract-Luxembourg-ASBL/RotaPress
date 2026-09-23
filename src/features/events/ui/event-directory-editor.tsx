"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CmsLocale } from "../../cms/cms_schemas";
import type { PublicEventCard } from "../event_catalogue";
import {
  eventDirectoryDesignSchema,
  type EventDirectoryDesign,
  type EventDirectoryWorkspace,
} from "../event_directory";
import { errorMessage, request, useResource } from "@/ui/api";
import { useCurrentUser } from "@/ui/admin-shell";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import { Icon } from "@/ui/icon";
import { MediaPicker } from "@/ui/media-picker";
import { EventDirectoryView } from "./event-directory-view";

type Workspace = EventDirectoryWorkspace & { events: PublicEventCard[] };
export function EventDirectoryEditor() {
  const [locale, setLocale] = useState<CmsLocale>("en");
  const [dirty, setDirty] = useState(false);
  const [generation, setGeneration] = useState(0);
  return (
    <>
      <label className="directory-locale">
        Page language
        <select
          value={locale}
          onChange={(event) => {
            if (
              !dirty ||
              window.confirm(
                "Discard unsaved directory changes and change language?",
              )
            ) {
              setDirty(false);
              setLocale(event.target.value as CmsLocale);
            }
          }}
        >
          <option value="en">English</option>
          <option value="fr">French</option>
          <option value="lb">Luxembourgish</option>
        </select>
      </label>
      <LoadedDirectory
        key={`${locale}:${generation}`}
        locale={locale}
        onDirty={setDirty}
        reload={() => {
          setDirty(false);
          setGeneration((value) => value + 1);
        }}
      />
    </>
  );
}
function LoadedDirectory({
  locale,
  onDirty,
  reload,
}: {
  locale: CmsLocale;
  onDirty: (dirty: boolean) => void;
  reload: () => void;
}) {
  const { data, error, refresh } = useResource<Workspace>(
    `/api/admin/events/directory?locale=${locale}`,
  );
  if (error)
    return (
      <Notice>
        {error}{" "}
        <button className="inline-button" onClick={refresh}>
          Try again
        </button>
      </Notice>
    );
  return data ? (
    <DirectoryEditor
      initial={data}
      locale={locale}
      onDirty={onDirty}
      reload={reload}
    />
  ) : (
    <Loading />
  );
}
function DirectoryEditor({
  initial,
  locale,
  onDirty,
  reload,
}: {
  initial: Workspace;
  locale: CmsLocale;
  onDirty: (dirty: boolean) => void;
  reload: () => void;
}) {
  const { capabilities } = useCurrentUser();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial.draft);
  const [section, setSection] = useState("intro");
  const [device, setDevice] = useState("desktop");
  const [period, setPeriod] = useState(draft.defaultPeriod);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.draft);
  const live = JSON.stringify(saved.draft) === JSON.stringify(saved.published);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const followLink = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        link &&
        link.getAttribute("target") !== "_blank" &&
        !window.confirm(
          "Leave this page and discard unsaved directory changes?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", followLink, true);
    };
  }, [dirty]);
  function change(next: Partial<EventDirectoryDesign>) {
    setDraft({ ...draft, ...next });
    setMessage("");
  }
  async function operate(action: "save" | "publish") {
    setError("");
    setMessage("");
    if (action === "save") {
      const result = eventDirectoryDesignSchema.safeParse(draft);
      if (!result.success) {
        setError(
          result.error.issues
            .map((issue) => `${issue.path.join(" ")}: ${issue.message}`)
            .join(" "),
        );
        return;
      }
    }
    setBusy(true);
    try {
      const next = await request<EventDirectoryWorkspace>(
        "/api/admin/events/directory",
        {
          method: "POST",
          body: JSON.stringify({
            action,
            input: {
              locale,
              expectedVersion: saved.version,
              ...(action === "save" ? { design: draft } : {}),
            },
          }),
        },
      );
      setSaved({ ...next, events: saved.events });
      setDraft(next.draft);
      setMessage(
        action === "save"
          ? "Directory draft saved. Visitors still see the published design."
          : "Directory published. Your /events page now uses this design.",
      );
    } catch (cause) {
      setError(`${errorMessage(cause)} Your entered changes are still here.`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="directory-editor">
      <PageHeading
        title="Events directory design"
        description="Design the page visitors see at /events. Your published events appear automatically."
      >
        <div className="forms-actions">
          <button
            className="button button-outline"
            disabled={busy || (!dirty && saved.version > 0)}
            onClick={() => void operate("save")}
          >
            Save design
          </button>
          <button
            className="button button-accent"
            disabled={
              busy ||
              dirty ||
              saved.version === 0 ||
              !capabilities.includes("cms.publish")
            }
            onClick={() => void operate("publish")}
          >
            {busy ? "Working…" : "Publish directory"}
          </button>
        </div>
      </PageHeading>
      <div className="directory-status">
        <span
          className="form-status"
          data-status={saved.published ? "published" : "draft"}
        >
          {saved.published ? "Published design" : "New design"}
        </span>
        <span>
          {dirty
            ? "Unsaved changes — save before publishing."
            : live
              ? "Up to date. Visitors see this design."
              : saved.version
                ? "Saved. Publish to apply this design."
                : "Save your first design, then publish when ready."}
        </span>
        <Link
          href={`/events?locale=${locale}`}
          target="_blank"
          className="text-link"
        >
          View public page <Icon name="external" />
        </Link>
      </div>
      {saved.replacesWebsitePage && (
        <Notice kind="info">
          Publishing applies this design to /events. Your existing website page
          is kept in Website → Pages.
        </Notice>
      )}
      {message && <Notice kind="success">{message}</Notice>}
      {error && (
        <Notice>
          {error}{" "}
          <button
            className="inline-button"
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Discard entered changes and reload the saved design?",
                )
              )
                reload();
            }}
          >
            Reload saved design
          </button>
        </Notice>
      )}
      <div className="directory-studio">
        <section
          className="directory-controls panel"
          aria-label="Directory controls"
        >
          <nav className="directory-control-tabs" aria-label="Design controls">
            {[
              ["intro", "Introduction"],
              ["list", "Event listings"],
              ["style", "Appearance"],
              ["seo", "Search preview"],
            ].map(([id, label]) => (
              <button
                type="button"
                aria-pressed={section === id}
                key={id}
                onClick={() => setSection(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <fieldset disabled={busy} className="forms-fieldset form-stack">
            {section === "intro" && (
              <>
                <label>
                  Small heading
                  <input
                    maxLength={100}
                    value={draft.eyebrow}
                    onChange={(e) => change({ eyebrow: e.target.value })}
                  />
                </label>
                <label>
                  Page title
                  <input
                    maxLength={160}
                    value={draft.title}
                    onChange={(e) => change({ title: e.target.value })}
                  />
                </label>
                <label>
                  Introduction
                  <textarea
                    maxLength={1500}
                    rows={4}
                    value={draft.introduction}
                    onChange={(e) => change({ introduction: e.target.value })}
                  />
                </label>
                <MediaPicker
                  label="Cover image"
                  value={draft.coverImageId ?? ""}
                  onChange={(id) => change({ coverImageId: id || null })}
                />
                <p className="field-help">
                  Choose a public image before publishing. It also becomes the
                  sharing image.
                </p>
              </>
            )}
            {section === "list" && (
              <>
                <label>
                  Show first
                  <select
                    value={draft.defaultPeriod}
                    onChange={(e) => {
                      const value = e.target
                        .value as EventDirectoryDesign["defaultPeriod"];
                      change({ defaultPeriod: value });
                      setPeriod(value);
                    }}
                  >
                    <option value="upcoming">Upcoming & ongoing events</option>
                    <option value="past">Past events</option>
                    <option value="all">All events</option>
                  </select>
                </label>
                {(
                  [
                    [
                      "showFilters",
                      "Let visitors switch between upcoming and past",
                    ],
                    ["showImages", "Show event images"],
                    ["showDescriptions", "Show short descriptions"],
                    ["showVenues", "Show venues"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="forms-check">
                    <input
                      type="checkbox"
                      checked={draft[key]}
                      onChange={(e) => change({ [key]: e.target.checked })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
                <label>
                  Event button label
                  <input
                    maxLength={60}
                    value={draft.buttonLabel}
                    onChange={(e) => change({ buttonLabel: e.target.value })}
                  />
                </label>
                <label>
                  Message when no events match
                  <textarea
                    maxLength={300}
                    value={draft.emptyMessage}
                    onChange={(e) => change({ emptyMessage: e.target.value })}
                  />
                </label>
                <p className="field-help">
                  Only published public events with a published event page
                  appear here.
                </p>
              </>
            )}
            {section === "style" && (
              <>
                <label>
                  Event layout
                  <select
                    value={draft.layout}
                    onChange={(e) =>
                      change({
                        layout: e.target
                          .value as EventDirectoryDesign["layout"],
                      })
                    }
                  >
                    <option value="cards">Card grid</option>
                    <option value="list">List</option>
                  </select>
                </label>
                <label>
                  Heading alignment
                  <select
                    value={draft.alignment}
                    onChange={(e) =>
                      change({
                        alignment: e.target
                          .value as EventDirectoryDesign["alignment"],
                      })
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Centered</option>
                  </select>
                </label>
                <label>
                  Introduction background
                  <select
                    value={draft.tone}
                    onChange={(e) =>
                      change({
                        tone: e.target.value as EventDirectoryDesign["tone"],
                      })
                    }
                  >
                    <option value="plain">Clean white</option>
                    <option value="soft">Soft neutral</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <p className="field-help">
                  Your website header and footer stay shared. These controls
                  style the directory itself.
                </p>
              </>
            )}
            {section === "seo" && (
              <>
                <label>
                  Search title
                  <input
                    maxLength={160}
                    value={draft.seoTitle}
                    placeholder={draft.title}
                    onChange={(e) => change({ seoTitle: e.target.value })}
                  />
                </label>
                <label>
                  Search description
                  <textarea
                    maxLength={300}
                    value={draft.seoDescription}
                    onChange={(e) => change({ seoDescription: e.target.value })}
                  />
                </label>
                <div className="directory-search-preview">
                  <small>/events</small>
                  <strong>{draft.seoTitle || draft.title}</strong>
                  <p>{draft.seoDescription || draft.introduction}</p>
                </div>
              </>
            )}
          </fieldset>
        </section>
        <section className="directory-preview" aria-label="Directory preview">
          <header>
            <span>Live draft preview</span>
            <div className="form-status-filters" aria-label="Preview width">
              <button
                aria-pressed={device === "desktop"}
                onClick={() => setDevice("desktop")}
              >
                <Icon name="desktop" />
                Desktop
              </button>
              <button
                aria-pressed={device === "phone"}
                onClick={() => setDevice("phone")}
              >
                <Icon name="mobile" />
                Phone
              </button>
            </div>
          </header>
          <div
            className="directory-preview-canvas cms-public"
            data-device={device}
          >
            <EventDirectoryView
              design={draft}
              events={saved.events}
              locale={locale}
              preview
              period={period}
              onPeriod={setPeriod}
            />
          </div>
          <p className="field-help">
            Preview uses your published events. Changes stay private until you
            publish this directory.
          </p>
        </section>
      </div>
    </div>
  );
}
