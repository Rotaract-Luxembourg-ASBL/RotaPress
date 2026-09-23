"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import type { CmsSummary } from "../../cms/cms_schemas";
import type { FormDto } from "../../forms/form_types";
import type { EventDraft } from "../event_schemas";
import type { EventReadiness } from "../event_readiness";
import { eventModules, type EventModuleState } from "../event_modules";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { EventRegistrationPanel } from "./event-registration-panel";
import { EventLumaPanel } from "@/integrations/luma/ui/event-luma-panel";
import { EventLumaSyncPanel } from "@/integrations/luma/ui/event-luma-sync-panel";
import { useCurrentUser } from "@/ui/admin-shell";
import { EventPagePlacement } from "./event-participation-setup";
import {
  FormArchiveAction,
  formArchiveMessage,
} from "@/features/forms/ui/form-archive-action";

export function EventFormsPanel({
  event,
  disabled,
  onSaved,
  readiness,
  readinessError,
}: {
  event: EventDraft;
  disabled: boolean;
  onSaved: (event: EventDraft) => void;
  readiness?: EventReadiness;
  readinessError?: string;
}) {
  const router = useRouter();
  const { features } = useCurrentUser();
  const { data, error, refresh } = useResource<{ forms: FormDto[] }>(
    features.forms ? `/api/admin/events/${event.id}/forms` : null,
  );
  const website = useResource<{
    modules: EventModuleState[];
    pages: CmsSummary[];
    registrationAuthority: "none" | "native" | "luma";
  }>(`/api/admin/events/${event.id}/website`);
  const [kind, setKind] = useState<"event" | "registration">("event");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [formView, setFormView] = useState("active");
  const [formMessage, setFormMessage] = useState("");
  const visibleForms = data?.forms.filter(
    (form) => formView === "all" || form.archived === (formView === "archived"),
  );
  const active = (key: string) =>
    website.data?.modules.some((m) => m.key === key && m.state === "enabled");
  const pages =
    website.data?.pages.filter(
      (page) => page.moduleKey === "website" && !page.archived,
    ) ?? [];
  const publicLocale =
    pages.find((item) => item.locale === "en")?.locale ??
    pages[0]?.locale ??
    "en";
  const locked = disabled || busy || event.archived || event.cancelled;
  const refreshWebsite = website.refresh;
  useEffect(() => {
    window.addEventListener("event-registration-updated", refreshWebsite);
    return () =>
      window.removeEventListener("event-registration-updated", refreshWebsite);
  }, [refreshWebsite]);
  useEffect(() => {
    const refreshContent = () => {
      refresh();
      refreshWebsite();
    };
    window.addEventListener("focus", refreshContent);
    window.addEventListener("event-pages-updated", refreshContent);
    return () => {
      window.removeEventListener("focus", refreshContent);
      window.removeEventListener("event-pages-updated", refreshContent);
    };
  }, [refresh, refreshWebsite]);
  const placement = {
    error: readinessError,
    eventPublished: event.published,
    canEdit:
      event.capabilities.includes("events.edit") &&
      Boolean(active("website")) &&
      !event.archived &&
      !event.cancelled,
    navigationDisabled: disabled || busy,
  };
  async function createRegistrationForm() {
    setBusy(true);
    setProblem(undefined);
    try {
      const form = await request<FormDto>(
        `/api/admin/events/${event.id}/forms`,
        {
          method: "POST",
          body: JSON.stringify({
            kind: "registration",
            title: `${event.title.slice(0, 147)} registration`,
          }),
        },
      );
      refresh();
      router.push(`/admin/forms/${form.id}`);
    } catch (cause) {
      setProblem(errorMessage(cause));
      setBusy(false);
    }
  }
  async function change(key: "forms" | "registration") {
    const enabling = !active(key);
    const dependents =
      key === "forms" &&
      active("registration") &&
      website.data?.registrationAuthority === "native";
    if (
      !window.confirm(
        `${enabling ? "Enable" : "Disable"} ${eventModules[key].label} for this event? ${!enabling && dependents ? "Registration will also be suspended. " : ""}Saved forms, responses and registrations are preserved.`,
      )
    )
      return;
    setBusy(true);
    setProblem(undefined);
    try {
      onSaved(
        await request<EventDraft>(`/api/admin/events/${event.id}/modules`, {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: event.version,
            key,
            operation: enabling ? "enable" : "disable",
            confirmed: true,
            suspendDependents: Boolean(dependents),
          }),
        }),
      );
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section
        className="panel form-stack event-participation-panel"
        aria-label="Event forms and registration"
      >
        <div>
          <p className="eyebrow">Participation</p>
          <h2>{features.forms ? "Registration & forms" : "Registration"}</h2>
          <p>
            Enable the tools you need, then prepare the forms and choose where
            they appear. Use the setup steps below to start taking
            registrations.
          </p>
        </div>
        {features.forms && error && <Notice>{error}</Notice>}
        {website.error && <Notice>{website.error}</Notice>}
        {readinessError && <Notice>{readinessError}</Notice>}
        {problem && <Notice>{problem}</Notice>}
        <div className="event-participation-grid">
          {(["forms", "registration"] as const)
            .filter((key) => key !== "forms" || features.forms)
            .map((key) => (
              <article className="event-feature" key={key}>
                <div className="event-feature-header">
                  <h3>{eventModules[key].label}</h3>
                  <span className="status-badge">
                    {!website.data
                      ? "Loading"
                      : active(key)
                        ? "Enabled"
                        : website.data.modules.find((m) => m.key === key)
                              ?.state === "suspended"
                          ? "Paused"
                          : "Not enabled"}
                  </span>
                </div>
                <p>
                  {key === "forms"
                    ? "Collect enquiries, preferences or registration details."
                    : "Let guests reserve their place and manage your guest list."}
                </p>
                {active(key) &&
                !readinessError &&
                readiness?.modules.find((module) => module.key === key)?.reasons
                  .length ? (
                  <ul className="field-help">
                    {readiness.modules
                      .find((module) => module.key === key)
                      ?.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                  </ul>
                ) : undefined}
                {!active("website") && website.data && !active(key) && (
                  <p className="field-help">
                    Enable Website in Event page & publishing first.
                  </p>
                )}
                {!event.capabilities.includes("events.modules.manage") &&
                  website.data &&
                  !active(key) && (
                    <p className="field-help">
                      Ask the event manager to enable this feature.
                    </p>
                  )}
                <div className="form-actions">
                  {event.capabilities.includes("events.modules.manage") && (
                    <button
                      className="button button-outline button-small"
                      disabled={
                        locked ||
                        !website.data ||
                        (!active(key) && !active("website"))
                      }
                      onClick={() => void change(key)}
                    >
                      {active(key) ? "Disable" : "Enable"}{" "}
                      {eventModules[key].label}
                    </button>
                  )}
                  {active(key) &&
                    event.published &&
                    !event.archived &&
                    !event.cancelled &&
                    !readinessError &&
                    readiness?.[key].available && (
                      <Link
                        className="text-link"
                        href={`/events/${event.slug}/${publicLocale}/${key}`}
                        target="_blank"
                      >
                        Open {eventModules[key].label.toLowerCase()}
                      </Link>
                    )}
                </div>
              </article>
            ))}
        </div>
        {website.data &&
          event.capabilities.includes("events.responses.manage") && (
            <EventRegistrationPanel
              eventId={event.id}
              forms={data?.forms ?? []}
              formsLoaded={!features.forms || Boolean(data)}
              canConfigure={event.capabilities.includes("events.publish")}
              canCreate={event.capabilities.includes("events.edit")}
              onCreateForm={() => void createRegistrationForm()}
              enabled={Boolean(active("registration"))}
              formsEnabled={features.forms && Boolean(active("forms"))}
              eventPublished={event.published}
              disabled={locked || !active("registration")}
              navigationDisabled={placement.navigationDisabled}
            />
          )}
        {active("registration") && (
          <EventPagePlacement
            kind="registration"
            {...placement}
            placement={readiness?.registration.placement}
          />
        )}
        {!features.forms ? (
          <p className="muted">
            Forms are turned off for this club. An administrator can enable them
            in Integrations to use event forms and free registration.
          </p>
        ) : !data ? (
          <Loading />
        ) : (
          <>
            {data.forms.length > 0 && (
              <SavedForms active={Boolean(active("forms"))}>
                {formMessage && <Notice kind="success">{formMessage}</Notice>}
                <label>
                  View event forms
                  <select
                    value={formView}
                    onChange={(change) => setFormView(change.target.value)}
                  >
                    <option value="active">Active forms</option>
                    <option value="archived">Removed / archived</option>
                    <option value="all">All forms</option>
                  </select>
                </label>
                <ul className="content-rows">
                  {visibleForms?.map((form) => (
                    <li className="content-row" key={form.id}>
                      <div>
                        <Link
                          href={`/admin/forms/${form.id}`}
                          className="text-link"
                          aria-disabled={disabled || busy}
                          onClick={(e) => {
                            if (disabled || busy) e.preventDefault();
                          }}
                        >
                          {form.draft.title}
                        </Link>
                        <p className="small muted">
                          {form.kind === "registration"
                            ? "Registration"
                            : "Event form"}{" "}
                          ·{" "}
                          {form.archived
                            ? "Removed · archived"
                            : form.publishedVersionId
                              ? "Published"
                              : "Draft"}
                        </p>
                      </div>
                      <div className="forms-actions">
                        {form.event?.canReadSubmissions && (
                          <Link
                            href={`/admin/inbox?formId=${form.id}`}
                            className="text-link"
                          >
                            View responses
                          </Link>
                        )}
                        <FormArchiveAction
                          form={form}
                          onDeleted={() => {
                            setFormMessage("Form permanently deleted.");
                            refresh();
                          }}
                          disabled={locked}
                          onChanged={(next) => {
                            setFormMessage(formArchiveMessage(next));
                            refresh();
                            window.dispatchEvent(
                              new Event("event-registration-updated"),
                            );
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                {!visibleForms?.length && (
                  <p className="field-help">
                    {formView === "archived"
                      ? "No removed forms. Archived forms will appear here and can be restored."
                      : "No active forms. Create a form or check Removed / archived."}
                  </p>
                )}
              </SavedForms>
            )}
            {active("forms") && event.capabilities.includes("events.edit") && (
              <form
                id="event-forms"
                className="form-stack event-participation-tools"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setProblem(undefined);
                  try {
                    await request(`/api/admin/events/${event.id}/forms`, {
                      method: "POST",
                      body: JSON.stringify({ kind, title }),
                    });
                    setTitle("");
                    refresh();
                    window.dispatchEvent(
                      new Event("event-registration-updated"),
                    );
                  } catch (cause) {
                    setProblem(errorMessage(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div>
                  <h3>Create an event form</h3>
                  <p className="field-help">
                    Start with a title, then edit the questions and publish in
                    the form editor. Only the manager and registration managers
                    can read responses.
                  </p>
                </div>
                <fieldset
                  disabled={locked || !active("forms")}
                  className="form-stack forms-fieldset"
                >
                  <div className="event-fields-grid">
                    <label>
                      Form purpose
                      <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value as typeof kind)}
                      >
                        <option value="event">Event enquiry</option>
                        <option value="registration">Free registration</option>
                      </select>
                    </label>
                    <label>
                      Form title
                      <input
                        required
                        maxLength={160}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="form-actions">
                    <button className="button button-outline">
                      Create event form draft
                    </button>
                  </div>
                </fieldset>
              </form>
            )}
            {active("forms") &&
              data.forms.some((form) => form.kind === "event") && (
                <EventPagePlacement
                  kind="form"
                  {...placement}
                  placement={readiness?.forms.placement}
                />
              )}
          </>
        )}
      </section>
      {event.capabilities.includes("events.edit") && (
        <EventLumaPanel
          key={`luma-${event.version}`}
          event={event}
          disabled={disabled || busy}
          registrationEnabled={Boolean(active("registration"))}
        />
      )}
      {event.capabilities.includes("events.responses.manage") &&
        website.data?.registrationAuthority === "luma" && (
          <EventLumaSyncPanel
            key={`luma-api-${event.version}`}
            eventId={event.id}
          />
        )}
    </>
  );
}

function SavedForms({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return active ? (
    <div className="form-stack">
      <h3>Your forms</h3>
      {children}
    </div>
  ) : (
    <details>
      <summary>Saved forms and responses</summary>
      <p className="field-help">
        Forms are paused. Your existing records are kept.
      </p>
      {children}
    </details>
  );
}
