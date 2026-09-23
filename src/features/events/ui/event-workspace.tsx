"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { errorMessage, request, useResource } from "@/ui/api";
import { Icon, type IconName } from "@/ui/icon";
import { Loading, Notice } from "@/ui/primitives";
import { useCurrentUser } from "@/ui/admin-shell";
import type { CmsSummary, CmsLocale } from "../../cms/cms_schemas";
import type { EventModuleState } from "../event_modules";
import type { EventDraft, EventFields as Fields } from "../event_schemas";
import { EventFields } from "./event-fields";
import { EventManagerDialog } from "./event-manager-dialog";
import { EventTeamPanel } from "./event-team-panel";
import { EventFormsPanel } from "./event-forms-panel";
import { EventCancellationPanel } from "./event-cancellation-panel";
import { EventWebsitePanel } from "./event-website-panel";
import { GuestAccessPanel } from "../../guests/ui/guest-access-panel";
import { EventEditorialPanel } from "./event-editorial-panel";
import { UnsavedPreview } from "../../cms/ui/unsaved-preview";
import { EventStudioShell } from "./event-studio-shell";
import { EventFeatureCatalogue } from "./event-feature-catalogue";
import { EventArchiveAction } from "./event-archive-action";
import { EventActionsMenu } from "./event-actions-menu";
import { useEventReadiness } from "./use-event-readiness";
import { EventReadinessSummary } from "./event-readiness-summary";
import { EventPackagesPanel } from "./event-packages-panel";
import { EventPrizesPanel } from "./event-prizes-workspace";

const sections: {
  key: string;
  label: string;
  description: string;
  icon: IconName;
}[] = [
  {
    key: "details",
    label: "Event details",
    description: "Set the name, date, venue and visibility for this event.",
    icon: "calendar",
  },
  {
    key: "website",
    label: "Event page",
    description: "Build your event's page and choose what visitors can see.",
    icon: "website",
  },
  {
    key: "packages",
    label: "Packages",
    description:
      "Prepare offers, display prices and connect external checkout sources.",
    icon: "forms",
  },
  {
    key: "prizes",
    label: "Prizes",
    description:
      "Prepare prize descriptions, images and donor profiles for the event gallery.",
    icon: "image",
  },
  {
    key: "participation",
    label: "Registration & forms",
    description:
      "Prepare your questions, open registration and review responses.",
    icon: "forms",
  },
  {
    key: "guests",
    label: "Guests",
    description: "Manage private guest access and invitations.",
    icon: "members",
  },
  {
    key: "team",
    label: "Team",
    description: "Choose who can work on this event.",
    icon: "members",
  },
  {
    key: "history",
    label: "History",
    description: "Review saved versions and restore an earlier draft.",
    icon: "undo",
  },
  {
    key: "features",
    label: "Add features",
    description: "Choose the tools this event needs. You can add more later.",
    icon: "plus",
  },
];

function fields(event: EventDraft): Fields {
  return {
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    venue: event.venue,
    visibility: event.visibility,
  };
}

function StudioPanel({
  section,
  active,
  children,
}: {
  section: string;
  active: string;
  children: ReactNode;
}) {
  const item = sections.find((entry) => entry.key === section)!;
  return (
    <section
      className="event-studio-panel"
      id={`event-${section}-content`}
      hidden={active !== section}
      aria-labelledby={`event-${section}-heading`}
    >
      <div className="event-studio-panel-heading">
        <h2 id={`event-${section}-heading`} tabIndex={-1}>
          {item.label}
        </h2>
        <p>{item.description}</p>
      </div>
      {children}
    </section>
  );
}

function DraftForm({
  initial,
  initialTab,
  initialPageId,
  initialLocale,
}: {
  initial: EventDraft;
  initialTab: string;
  initialPageId?: string;
  initialLocale?: CmsLocale;
}) {
  const { capabilities } = useCurrentUser();
  const [changingManager, setChangingManager] = useState(false);
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(fields(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState("");
  const [pageDirty, setPageDirty] = useState(false);
  const [packagesDirty, setPackagesDirty] = useState(false);
  const [prizesDirty, setPrizesDirty] = useState(false);
  const contentDirty = packagesDirty || prizesDirty || pageDirty;
  const [activeSection, setActiveSection] = useState(
    sections.some((item) => item.key === initialTab) &&
      (initialTab !== "guests" ||
        initial.capabilities.includes("events.guests.manage")) &&
      (!["packages", "prizes"].includes(initialTab) ||
        initial.capabilities.includes("events.edit"))
      ? initialTab
      : "details",
  );
  const workspace = useResource<{
    modules: EventModuleState[];
    pages: CmsSummary[];
    registrationAuthority: "none" | "native" | "luma";
  }>(`/api/admin/events/${saved.id}/website`);
  const readiness = useEventReadiness(saved.id, saved.version);
  const refreshWorkspace = workspace.refresh;
  useEffect(() => {
    refreshWorkspace();
  }, [saved.version, refreshWorkspace]);
  useEffect(() => {
    window.addEventListener("focus", refreshWorkspace);
    window.addEventListener("event-pages-updated", refreshWorkspace);
    return () => {
      window.removeEventListener("focus", refreshWorkspace);
      window.removeEventListener("event-pages-updated", refreshWorkspace);
    };
  }, [refreshWorkspace]);
  const modules = workspace.data?.modules ?? [];
  const websiteEnabled = modules.some(
    (module) => module.key === "website" && module.state === "enabled",
  );
  const canManagePackages =
    websiteEnabled && saved.capabilities.includes("events.edit");
  const used = (keys: string[]) =>
    modules.some(
      (module) => keys.includes(module.key) && module.state !== "disabled",
    );
  const visibleSections = sections.filter((section) => {
    if (section.key === "packages") return canManagePackages;
    if (section.key === "prizes")
      return (
        saved.capabilities.includes("events.edit") &&
        (used(["prizes"]) || activeSection === "prizes")
      );
    if (
      section.key === "guests" &&
      !saved.capabilities.includes("events.guests.manage")
    )
      return false;
    if (section.key === activeSection) return true;
    if (section.key === "website")
      return (
        used(["website", "gallery", "sponsors"]) ||
        Boolean(workspace.data?.pages.length)
      );
    if (section.key === "participation") return used(["forms", "registration"]);
    if (section.key === "guests") return used(["portal"]);
    return true;
  });
  function openSection(key: string) {
    setActiveSection(key);
    window.history.replaceState(
      null,
      "",
      `/admin/events/${saved.id}?tab=${key}`,
    );
    requestAnimationFrame(() => {
      document.querySelector(".event-studio-content")?.scrollTo({ top: 0 });
      document
        .getElementById(`event-${key}-heading`)
        ?.focus({ preventScroll: true });
    });
  }
  const dirty = JSON.stringify(value) !== JSON.stringify(fields(saved));
  const canEdit =
    saved.capabilities.includes("events.edit") &&
    !saved.archived &&
    !saved.cancelled;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function acceptSaved(updated: EventDraft) {
    setSaved(updated);
    // A feature request may finish after the user has returned to Details.
    // Keep edits made while that request was in flight.
    setValue((current) =>
      JSON.stringify(current) === JSON.stringify(fields(saved))
        ? fields(updated)
        : current,
    );
  }
  async function mutate() {
    setBusy(true);
    setError(undefined);
    setMessage("");
    try {
      const updated = await request<EventDraft>(
        `/api/admin/events/${saved.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ ...value, expectedVersion: saved.version }),
        },
      );
      acceptSaved(updated);
      setValue(fields(updated));
      setMessage("Event draft saved. It remains private.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate();
  }
  const status = saved.archived
    ? "Removed · archived"
    : saved.cancelled
      ? "Cancelled"
      : saved.published
        ? "Details published"
        : "Draft";
  return (
    <EventStudioShell
      title={saved.title}
      status={
        <>
          <span className="status-badge">{status}</span>
          <span role="status">
            {busy
              ? "Saving event…"
              : dirty
                ? "Unsaved details"
                : contentDirty
                  ? "Unsaved content"
                  : "Saved"}
          </span>
        </>
      }
      onBack={() =>
        (!dirty && !contentDirty) ||
        window.confirm("Leave this event and discard unsaved changes?")
      }
      onBeforeNavigate={() =>
        (!dirty && !contentDirty) ||
        window.confirm("Leave this event and discard unsaved content changes?")
      }
      actions={
        <>
          {canEdit && activeSection === "details" ? (
            <>
              <UnsavedPreview
                endpoint={`/api/admin/events/${saved.id}/preview`}
                disabled={busy}
                payload={{
                  expectedVersion: saved.version,
                  fields: value,
                  locale: "en",
                }}
              />
              <button
                type="submit"
                form="event-details-form"
                className="button button-accent"
                disabled={busy || !dirty}
              >
                {busy ? "Saving…" : "Save event draft"}
              </button>
            </>
          ) : undefined}
          {!saved.archived &&
            (saved.capabilities.includes("events.archive") ||
              (!saved.cancelled &&
                saved.capabilities.includes("events.cancel"))) && (
              <EventActionsMenu>
                {!saved.cancelled &&
                  saved.capabilities.includes("events.cancel") && (
                    <EventCancellationPanel
                      event={saved}
                      compact
                      disabled={busy || dirty || contentDirty}
                      onSaved={acceptSaved}
                    />
                  )}
                {saved.capabilities.includes("events.archive") && (
                  <EventArchiveAction
                    event={saved}
                    disabled={busy || dirty || contentDirty}
                    onArchived={(updated) => {
                      acceptSaved(updated);
                      setMessage(
                        "Event removed from active events. Its content and records are retained in Removed / archived.",
                      );
                    }}
                  />
                )}
              </EventActionsMenu>
            )}
        </>
      }
      navigation={
        <nav className="event-studio-nav" aria-label="Event editor sections">
          {[
            { label: "Event & website", keys: ["details", "website"] },
            {
              label: "Participation",
              keys: ["packages", "prizes", "participation", "guests"],
            },
            { label: "Manage", keys: ["team", "history", "features"] },
          ].map((group) => (
            <div className="event-navigation-group" key={group.label}>
              <p className="event-studio-nav-label">{group.label}</p>
              {visibleSections
                .filter((section) => group.keys.includes(section.key))
                .map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    className={
                      section.key === "features"
                        ? "event-studio-add-features"
                        : undefined
                    }
                    aria-current={
                      activeSection === section.key ? "page" : undefined
                    }
                    aria-controls={`event-${section.key}-content`}
                    onClick={() => openSection(section.key)}
                  >
                    <Icon name={section.icon} />
                    {section.label}
                  </button>
                ))}
            </div>
          ))}
        </nav>
      }
    >
      {error && <Notice>{error}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      {dirty && activeSection !== "details" && (
        <Notice kind="info">
          Your event details have unsaved changes.{" "}
          <button
            className="inline-button"
            onClick={() => openSection("details")}
          >
            Review and save details
          </button>{" "}
          before changing features or publishing.
        </Notice>
      )}
      <StudioPanel section="details" active={activeSection}>
        <EventReadinessSummary
          readiness={readiness.data}
          error={readiness.error}
          onOpen={openSection}
          canManageGuests={saved.capabilities.includes("events.guests.manage")}
          canEditEvent={saved.capabilities.includes("events.edit")}
        />
        <form
          id="event-details-form"
          className="panel form-stack event-details-form"
          onSubmit={submit}
          aria-busy={busy}
        >
          <div className="event-details-manager">
            <p>
              Responsible manager:{" "}
              <strong>{saved.manager?.name ?? "Unavailable"}</strong>
            </p>
            {capabilities.includes("events.manage") &&
              !saved.archived &&
              !saved.cancelled && (
                <button
                  type="button"
                  className="inline-button"
                  disabled={busy || dirty}
                  onClick={() => setChangingManager(true)}
                >
                  Change manager
                </button>
              )}
          </div>
          <fieldset
            className="form-stack event-fieldset event-details-grid"
            disabled={busy || !canEdit}
          >
            <EventFields
              value={value}
              onChange={(next) => {
                setValue(next);
                setMessage("");
              }}
            />
          </fieldset>
        </form>
        {saved.cancelled && saved.capabilities.includes("events.cancel") && (
          <EventCancellationPanel
            event={saved}
            disabled={busy || dirty}
            onSaved={acceptSaved}
          />
        )}
      </StudioPanel>
      <StudioPanel section="website" active={activeSection}>
        <EventWebsitePanel
          event={saved}
          disabled={busy || dirty || packagesDirty || prizesDirty}
          onPagesChanged={refreshWorkspace}
          onSaved={acceptSaved}
          active={activeSection === "website"}
          onDirtyChange={setPageDirty}
          initialPageId={initialPageId}
          initialLocale={initialLocale}
        />
      </StudioPanel>
      <StudioPanel section="participation" active={activeSection}>
        <EventFormsPanel
          key={`forms-${saved.version}`}
          event={saved}
          disabled={busy || dirty}
          onSaved={acceptSaved}
          readiness={readiness.data}
          readinessError={readiness.error}
        />
      </StudioPanel>
      <StudioPanel section="packages" active={activeSection}>
        {canManagePackages ? (
          <EventPackagesPanel
            eventId={saved.id}
            disabled={busy || dirty || saved.archived || saved.cancelled}
            active={activeSection === "packages"}
            onDirtyChange={setPackagesDirty}
          />
        ) : (
          <p>Packages require the Website feature and event editing access.</p>
        )}
      </StudioPanel>
      {saved.capabilities.includes("events.edit") && (
        <StudioPanel section="prizes" active={activeSection}>
          <EventPrizesPanel
            event={saved}
            moduleState={
              modules.find((module) => module.key === "prizes")?.state ??
              "disabled"
            }
            disabled={busy || dirty}
            active={activeSection === "prizes"}
            onSaved={acceptSaved}
            onDirtyChange={setPrizesDirty}
          />
        </StudioPanel>
      )}
      {saved.capabilities.includes("events.guests.manage") && (
        <StudioPanel section="guests" active={activeSection}>
          <GuestAccessPanel
            key={`guests-${saved.version}`}
            event={saved}
            disabled={busy || dirty}
            onSaved={acceptSaved}
          />
        </StudioPanel>
      )}
      <StudioPanel section="team" active={activeSection}>
        <EventTeamPanel
          key={`team-${saved.version}`}
          event={saved}
          disabled={busy || dirty}
          onSaved={(updated) => {
            acceptSaved(updated);
            setMessage(
              "Event team updated. Event details and club permissions are unchanged.",
            );
          }}
        />
      </StudioPanel>
      <StudioPanel section="history" active={activeSection}>
        <EventEditorialPanel
          key={`history-${saved.version}`}
          event={saved}
          disabled={busy || dirty}
          onSaved={acceptSaved}
        />
      </StudioPanel>
      <StudioPanel section="features" active={activeSection}>
        {workspace.error ? (
          <Notice>{workspace.error}</Notice>
        ) : workspace.data ? (
          <EventFeatureCatalogue
            event={saved}
            modules={modules}
            registrationAuthority={workspace.data.registrationAuthority}
            readiness={readiness.data}
            readinessError={readiness.error}
            disabled={busy || dirty || contentDirty}
            onSaved={acceptSaved}
            onOpen={openSection}
          />
        ) : (
          <Loading />
        )}
      </StudioPanel>
      {changingManager && (
        <EventManagerDialog
          event={saved}
          onClose={() => setChangingManager(false)}
          onSaved={(updated) => {
            acceptSaved(updated);
            setChangingManager(false);
            setMessage(
              "Event manager updated. Existing event details are preserved.",
            );
          }}
        />
      )}
    </EventStudioShell>
  );
}

export function EventWorkspace({
  id,
  initialTab = "details",
  initialPageId,
  initialLocale,
}: {
  id: string;
  initialTab?: string;
  initialPageId?: string;
  initialLocale?: CmsLocale;
}) {
  const { data, error, refresh } = useResource<EventDraft>(
    `/api/admin/events/${id}`,
  );
  return error ? (
    <main id="main-content" className="content-width standalone-state">
      <Notice>
        {error}{" "}
        <button className="inline-button" onClick={refresh}>
          Try again
        </button>
      </Notice>
    </main>
  ) : data ? (
    <DraftForm
      key={`${id}:${initialPageId ?? "main"}:${initialLocale ?? "en"}`}
      initial={data}
      initialTab={initialTab}
      initialPageId={initialPageId}
      initialLocale={initialLocale}
    />
  ) : (
    <main id="main-content">
      <Loading />
    </main>
  );
}
