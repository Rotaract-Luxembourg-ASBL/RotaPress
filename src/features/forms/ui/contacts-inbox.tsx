"use client";
import { answerText } from "../form_elements";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { errorMessage, request, useResource } from "@/ui/api";
import { FilterTabs, StatusBadge } from "@/ui/collection";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import type { InboxMessage } from "../inbox_schemas";
import type { SubmissionDto } from "../form_types";
import { submissionStatuses, type SubmissionStatus } from "../form_schemas";
import { useInboxPage } from "./use-inbox-page";

const statusNames = { new: "New", reviewing: "In progress", closed: "Closed" };
const purposeNames: Record<string, string> = {
  contact: "Website enquiries",
  membership: "Membership applications",
  event: "Event forms",
  registration: "Event registrations",
};

type InboxFilters = {
  query: string;
  status: string;
  kind: string;
  after: string;
  before: string;
};

export function ContactsInbox() {
  const params = useSearchParams();
  const formId = params.get("formId") ?? "";
  const requestedStatus = params.get("status") ?? "";
  const initialFilters: InboxFilters = {
    query: params.get("q") ?? "",
    status: submissionStatuses.some((value) => value === requestedStatus)
      ? requestedStatus
      : "",
    kind: Object.hasOwn(purposeNames, params.get("kind") ?? "")
      ? params.get("kind")!
      : "",
    after: params.get("after") ?? "",
    before: params.get("before") ?? "",
  };
  return (
    <InboxWorkspace
      key={params.toString()}
      formId={formId}
      initialFilters={initialFilters}
      initialView={params.get("view") === "people" ? "contacts" : "inbox"}
    />
  );
}

function InboxWorkspace({
  formId,
  initialFilters,
  initialView,
}: {
  formId: string;
  initialFilters: InboxFilters;
  initialView: "inbox" | "contacts";
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [search, setSearch] = useState(initialFilters.query);
  const [query, setQuery] = useState(initialFilters.query);
  const [status, setStatus] = useState(initialFilters.status);
  const [kind, setKind] = useState(initialFilters.kind);
  const [after, setAfter] = useState(initialFilters.after);
  const [before, setBefore] = useState(initialFilters.before);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<InboxMessage>();
  const [selectionRequest, setSelectionRequest] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const responseButtons = useRef(new Map<string, HTMLButtonElement>());
  const filters = new URLSearchParams({ q: query, page: String(page) });
  if (status) filters.set("status", status);
  if (formId) filters.set("formId", formId);
  if (kind) filters.set("kind", kind);
  if (after) filters.set("after", after);
  if (before) filters.set("before", before);
  const { data, forms, error, refresh } = useInboxPage(
    `/api/admin/inbox?${filters}`,
  );
  function selectForm(value: string, onlyQuery?: string, nextView = view) {
    const next = new URLSearchParams();
    if (value) next.set("formId", value);
    if (nextView === "contacts") next.set("view", "people");
    const searchQuery = onlyQuery ?? query;
    if (searchQuery) next.set("q", searchQuery);
    if (onlyQuery === undefined) {
      if (status) next.set("status", status);
      if (kind) next.set("kind", kind);
      if (after) next.set("after", after);
      if (before) next.set("before", before);
    }
    router.push(`/admin/inbox${next.size ? `?${next}` : ""}`, {
      scroll: false,
    });
  }
  if (
    !user.capabilities.includes("submissions.read") &&
    !user.capabilities.includes("events.access")
  )
    return (
      <Notice>
        You do not have access to the club inbox. Event responses remain in your
        assigned event workspace.
      </Notice>
    );
  const contacts = new Map<
    string,
    { name: string; email: string | null; messages: number; latest: string }
  >();
  for (const message of data?.messages ?? []) {
    // Group supplied addresses for staff review only; this does not verify a person.
    const key = message.email ?? message.id;
    const existing = contacts.get(key);
    if (existing) existing.messages++;
    else
      contacts.set(key, {
        name: message.name,
        email: message.email,
        messages: 1,
        latest: message.receivedAt,
      });
  }
  function find(event: FormEvent) {
    event.preventDefault();
    setQuery(search);
    setPage(0);
    setSelected(undefined);
  }
  function clearFilters() {
    setQuery("");
    setSearch("");
    setStatus("");
    selectForm("", "");
    setKind("");
    setAfter("");
    setBefore("");
    setPage(0);
    setSelected(undefined);
  }
  const secondaryFilterCount = [kind, after, before].filter(Boolean).length;
  const hasFilters = Boolean(query || status || formId || secondaryFilterCount);
  return (
    <div className="response-center">
      <PageHeading
        title="Response center"
        description="Review enquiries, applications and event responses."
      >
        {user.capabilities.includes("forms.edit") && (
          <Link href="/admin/forms" className="button button-outline">
            Manage forms
          </Link>
        )}
      </PageHeading>
      <nav className="admin-workspace-tabs" aria-label="Response workspace">
        <button
          type="button"
          aria-current={view === "inbox" ? "page" : undefined}
          onClick={() => {
            setView("inbox");
            setSelectionRequest(0);
          }}
        >
          Responses
        </button>
        <button
          type="button"
          aria-current={view === "contacts" ? "page" : undefined}
          onClick={() => {
            setView("contacts");
            setSelectionRequest(0);
          }}
        >
          People
        </button>
      </nav>
      <section className="inbox-controls" aria-label="Response filters">
        <div className="inbox-status-filters">
          <FilterTabs
            label="Filter responses by status"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(0);
              setSelected(undefined);
            }}
            options={[
              { value: "", label: "All responses" },
              ...submissionStatuses.map((value) => ({
                value,
                label: statusNames[value],
              })),
            ]}
          />
          {hasFilters && (
            <button
              type="button"
              className="inline-button"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="inbox-toolbar">
          <form onSubmit={find} className="inbox-search">
            <label>
              Search contacts and messages
              <input
                value={search}
                maxLength={160}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, email or message"
              />
            </label>
            <button className="button button-outline">Search</button>
          </form>
          <label>
            Source form
            <select
              value={formId}
              onChange={(event) => {
                selectForm(event.target.value);
                setPage(0);
                setSelected(undefined);
              }}
            >
              <option value="">All forms</option>
              {formId && !forms?.some((item) => item.id === formId) && (
                <option value={formId}>Selected form</option>
              )}
              {forms?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                  {item.eventTitle ? ` · ${item.eventTitle}` : ""}
                  {item.archived ? " · archived" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button-outline"
            aria-expanded={showFilters}
            aria-controls="inbox-more-filters"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? "Hide filters" : "More filters"}
            {secondaryFilterCount > 0 && ` (${secondaryFilterCount})`}
          </button>
        </div>
        <div
          id="inbox-more-filters"
          className="inbox-filters"
          hidden={!showFilters}
        >
          <label>
            Form purpose
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(0);
                setSelected(undefined);
              }}
            >
              <option value="">All purposes</option>
              <option value="contact">Website enquiries</option>
              <option value="membership">Membership applications</option>
              <option value="event">Event forms</option>
              <option value="registration">Event registrations</option>
            </select>
          </label>
          <label>
            Received from
            <input
              type="date"
              value={after}
              max={before || undefined}
              onChange={(e) => {
                setAfter(e.target.value);
                setPage(0);
                setSelected(undefined);
              }}
            />
          </label>
          <label>
            Received through
            <input
              type="date"
              value={before}
              min={after || undefined}
              onChange={(e) => {
                setBefore(e.target.value);
                setPage(0);
                setSelected(undefined);
              }}
            />
          </label>
          <p className="field-help">
            Date filters use UTC. Changes apply immediately.
          </p>
        </div>
        {(formId || query || secondaryFilterCount > 0) && (
          <div
            className="inbox-active-filters"
            aria-label="Active response filters"
          >
            {formId && (
              <>
                <strong>
                  Responses for{" "}
                  {forms?.find((item) => item.id === formId)?.title ??
                    "the selected form"}
                </strong>
                <button
                  type="button"
                  className="inline-button"
                  onClick={() => selectForm("")}
                >
                  View all forms
                </button>
              </>
            )}
            {query && <span>Search: {query}</span>}
            {kind && <span>Purpose: {purposeNames[kind] ?? kind}</span>}
            {after && <span>From {after}</span>}
            {before && <span>Through {before}</span>}
          </div>
        )}
      </section>
      {error && (
        <Notice>
          {error}{" "}
          <button type="button" className="inline-button" onClick={refresh}>
            Retry responses
          </button>
        </Notice>
      )}
      {!data && !error && <Loading />}
      {data && !error && (
        <>
          <div className="inbox-results-summary" role="status">
            <p>
              Showing {data.messages.length} of{" "}
              <strong>
                {data.total} matching{" "}
                {data.total === 1 ? "response" : "responses"}
              </strong>
              {page > 0 && ` · Page ${page + 1}`}
            </p>
            <p aria-label="Matching response counts">
              New {data.counts.new} · In progress {data.counts.reviewing} ·
              Closed {data.counts.closed}
              <span className="inbox-count-scope">
                Across all filtered pages
              </span>
            </p>
          </div>
          {view === "contacts" ? (
            <section className="panel">
              <h2>People in this view</h2>
              <p className="field-help">
                Grouped by supplied email from this result page. Open a contact
                to search their messages across all forms. Membership and guest
                access are managed separately.
              </p>
              {!contacts.size && <p>No contacts match these filters.</p>}
              <div className="inbox-contacts">
                {Array.from(contacts, ([key, contact]) => (
                  <article key={key}>
                    <h3>{contact.name}</h3>
                    <p>{contact.email ?? "No email supplied"}</p>
                    <p className="muted">
                      {contact.messages} response
                      {contact.messages === 1 ? "" : "s"} in this view
                    </p>
                    {contact.email && (
                      <button
                        type="button"
                        className="button button-outline"
                        onClick={() => {
                          setSearch(contact.email!);
                          setQuery(contact.email!);
                          setStatus("");
                          selectForm("", contact.email!, "inbox");
                          setKind("");
                          setAfter("");
                          setBefore("");
                          setPage(0);
                          setView("inbox");
                          setSelected(undefined);
                        }}
                      >
                        Open response history
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <div className="inbox-workspace" data-selected={Boolean(selected)}>
              <section className="panel inbox-messages" aria-label="Responses">
                {!data.messages.length && (
                  <div className="empty-state">
                    <h2>
                      {hasFilters
                        ? "No responses match these filters"
                        : "Your inbox is clear"}
                    </h2>
                    <p>
                      {hasFilters
                        ? "Try another search or clear your filters to see all permitted responses."
                        : "Responses to published forms and event registrations appear here."}
                    </p>
                  </div>
                )}
                {data.messages.map((message) => (
                  <button
                    type="button"
                    key={message.id}
                    ref={(element) => {
                      if (element)
                        responseButtons.current.set(message.id, element);
                      else responseButtons.current.delete(message.id);
                    }}
                    className="inbox-message"
                    aria-pressed={selected?.id === message.id}
                    onClick={() => {
                      setSelected(message);
                      setSelectionRequest((value) => value + 1);
                    }}
                  >
                    <span className="inbox-message-heading">
                      <strong>{message.name}</strong>
                      <StatusBadge
                        tone={
                          message.status === "new"
                            ? "warning"
                            : message.status === "closed"
                              ? "success"
                              : "neutral"
                        }
                      >
                        {statusNames[message.status]}
                      </StatusBadge>
                    </span>
                    <span className="response-source">
                      {message.formTitle} ·{" "}
                      {message.kind === "membership"
                        ? "Application"
                        : message.kind === "registration"
                          ? "Registration"
                          : message.eventTitle || "Website"}
                    </span>
                    <span>{message.email ?? "No email supplied"}</span>
                    <span className="inbox-snippet">{message.preview}</span>
                    <span className="muted">
                      {new Date(message.receivedAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </section>
              {selected ? (
                <MessagePanel
                  key={selected.id}
                  message={selected}
                  selectionRequest={selectionRequest}
                  onSaved={refresh}
                  onBack={() => {
                    const id = selected.id;
                    setSelected(undefined);
                    requestAnimationFrame(() =>
                      responseButtons.current.get(id)?.focus(),
                    );
                  }}
                />
              ) : (
                <section className="panel empty-state">
                  <h2>Select a response</h2>
                  <p>
                    Read the original response, update its status and review
                    delivery from one place.
                  </p>
                </section>
              )}
            </div>
          )}
          {(page > 0 || data.hasMore) && (
            <div className="forms-actions inbox-pagination">
              <button
                type="button"
                className="button button-outline"
                disabled={page === 0}
                onClick={() => {
                  setPage(page - 1);
                  setSelected(undefined);
                }}
              >
                Previous page
              </button>
              <button
                type="button"
                className="button button-outline"
                disabled={!data.hasMore}
                onClick={() => {
                  setPage(page + 1);
                  setSelected(undefined);
                }}
              >
                Next page
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MessagePanel({
  message,
  selectionRequest,
  onSaved,
  onBack,
}: {
  message: InboxMessage;
  selectionRequest: number;
  onSaved: () => void;
  onBack: () => void;
}) {
  const { data, error, refresh } = useResource<SubmissionDto>(
    `/api/admin/forms/submissions/${message.id}`,
  );
  const [status, setStatus] = useState<SubmissionStatus>(message.status);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const lastSelection = useRef(0);
  useEffect(() => {
    if (!selectionRequest) {
      lastSelection.current = 0;
      return;
    }
    if (!data || selectionRequest === lastSelection.current) return;
    lastSelection.current = selectionRequest;
    if (!window.matchMedia("(max-width: 900px)").matches) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "center" });
  }, [data, selectionRequest]);
  async function save() {
    setBusy(true);
    setFailure(undefined);
    setNotice(undefined);
    try {
      await request(`/api/admin/forms/submissions/${message.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setNotice("Review status saved.");
      refresh();
      onSaved();
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel inbox-detail" aria-label="Selected response">
      <button
        type="button"
        className="inline-button inbox-back"
        onClick={onBack}
      >
        Back to responses
      </button>
      <p className="eyebrow">{message.formTitle}</p>
      <h2 ref={heading} tabIndex={-1}>
        {message.name}
      </h2>
      <p>{message.email}</p>
      {message.eventTitle && (
        <p className="field-help">Event: {message.eventTitle}</p>
      )}
      <p className="field-help">
        {message.verified
          ? "Submitted with a verified account"
          : "Contact details supplied by the visitor"}
      </p>
      {error && (
        <Notice>
          {error}{" "}
          <button type="button" className="inline-button" onClick={refresh}>
            Retry response
          </button>
        </Notice>
      )}
      {failure && <Notice>{failure}</Notice>}
      {notice && <Notice kind="success">{notice}</Notice>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <p className="muted">
            {data.formTitle} · version {data.versionNumber} ·{" "}
            {new Date(data.receivedAt).toLocaleString()}
          </p>
          <dl className="inbox-answers">
            {data.definition.fields
              .filter((field) => Object.hasOwn(data.answers, field.id))
              .map((field) => (
                <div key={field.id}>
                  <dt>{field.label}</dt>
                  <dd>{answerText(data.answers[field.id]) || "No answer"}</dd>
                </div>
              ))}
          </dl>
          <div className="inbox-status">
            <label>
              Review status
              <select
                value={status}
                disabled={busy}
                onChange={(event) =>
                  setStatus(event.target.value as SubmissionStatus)
                }
              >
                {submissionStatuses.map((value) => (
                  <option key={value} value={value}>
                    {statusNames[value]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button button-accent"
              disabled={busy}
              onClick={save}
            >
              {busy ? "Saving…" : "Save status"}
            </button>
          </div>
          <p className="field-help">
            Email delivery: {data.notifications.sent} sent ·{" "}
            {data.notifications.pending + data.notifications.processing} queued
            · {data.notifications.failed} failed.
          </p>
          <div className="forms-actions">
            <Link
              href={`/admin/forms/${message.formId}/submissions/${message.id}`}
              className="text-link"
            >
              Full response & delivery
            </Link>
            <Link href={`/admin/forms/${message.formId}`} className="text-link">
              Form & notifications
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
