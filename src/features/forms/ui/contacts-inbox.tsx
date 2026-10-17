"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { FilterTabs, StatusBadge } from "@/ui/collection";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import { submissionStatuses } from "../form_schemas";
import { useInboxPage } from "./use-inbox-page";
import { InboxMessagePanel } from "./inbox-message-panel";
import { InboxSourcePicker } from "./inbox-source-picker";

const statusNames = { new: "New", reviewing: "In progress", closed: "Closed" };
const purposeNames: Record<string, string> = {
  contact: "Website enquiries",
  membership: "Membership applications",
  event: "Event forms",
  registration: "Event registrations",
};

export function ContactsInbox() {
  const params = useSearchParams();
  const user = useCurrentUser();
  const router = useRouter();
  const formId = params.get("formId") ?? "";
  const query = params.get("q") ?? "";
  const status = submissionStatuses.some(
    (value) => value === params.get("status"),
  )
    ? params.get("status")!
    : "";
  const kind = Object.hasOwn(purposeNames, params.get("kind") ?? "")
    ? params.get("kind")!
    : "";
  const after = params.get("after") ?? "";
  const before = params.get("before") ?? "";
  const view = params.get("view") === "people" ? "contacts" : "inbox";
  const page = Math.min(
    1000,
    Math.max(0, Math.floor(Number(params.get("page"))) || 0),
  );
  const [selectionRequest, setSelectionRequest] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const responseButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusOnReturn = useRef<string | null>(null);
  const filters = new URLSearchParams({ q: query, page: String(page) });
  if (status) filters.set("status", status);
  if (formId) filters.set("formId", formId);
  if (kind) filters.set("kind", kind);
  if (after) filters.set("after", after);
  if (before) filters.set("before", before);
  const { data, error, refresh } = useInboxPage(`/api/admin/inbox?${filters}`);
  const selected = data?.messages.find(
    (message) => message.id === params.get("response"),
  );
  useEffect(() => {
    if (selected || !focusOnReturn.current) return;
    const target = responseButtons.current.get(focusOnReturn.current);
    if (target) {
      target.focus();
      focusOnReturn.current = null;
    }
  }, [selected, data]);
  function update(values: Record<string, string>, resetPage = true) {
    const next = new URLSearchParams(params);
    if (resetPage) next.delete("page");
    if (!("response" in values)) next.delete("response");
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`/admin/inbox${next.size ? `?${next}` : ""}`, {
      scroll: false,
    });
  }
  function selectForm(value: string, onlyQuery?: string, nextView = view) {
    update({
      formId: value,
      view: nextView === "contacts" ? "people" : "",
      ...(onlyQuery === undefined
        ? {}
        : { q: onlyQuery, status: "", kind: "", after: "", before: "" }),
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
  function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update({ q: String(new FormData(event.currentTarget).get("q") ?? "") });
  }
  function clearFilters() {
    update({ q: "", status: "", formId: "", kind: "", after: "", before: "" });
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
            update({ view: "" }, false);
            setSelectionRequest(0);
          }}
        >
          Responses
        </button>
        <button
          type="button"
          aria-current={view === "contacts" ? "page" : undefined}
          onClick={() => {
            update({ view: "people" }, false);
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
              update({ status: value });
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
                key={query}
                name="q"
                defaultValue={query}
                maxLength={160}
                placeholder="Name, email or message"
              />
            </label>
            <button className="button button-outline">Search</button>
          </form>
          <InboxSourcePicker value={formId} onChange={selectForm} />
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
                update({ kind: e.target.value });
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
                update({ after: e.target.value });
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
                update({ before: e.target.value });
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
              <button
                type="button"
                className="inline-button"
                onClick={() => selectForm("")}
              >
                View all forms
              </button>
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
                          selectForm("", contact.email!, "inbox");
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
                      update({ response: message.id }, false);
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
                <InboxMessagePanel
                  key={selected.id}
                  message={selected}
                  selectionRequest={selectionRequest}
                  onSaved={refresh}
                  returnTo={`/admin/inbox?${params}`}
                  onBack={() => {
                    focusOnReturn.current = selected.id;
                    update({ response: "" }, false);
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
                  update({ page: String(page - 1) }, false);
                }}
              >
                Previous page
              </button>
              <button
                type="button"
                className="button button-outline"
                disabled={!data.hasMore}
                onClick={() => {
                  update({ page: String(page + 1) }, false);
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
