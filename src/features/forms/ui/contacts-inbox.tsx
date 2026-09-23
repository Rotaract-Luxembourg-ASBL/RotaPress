"use client";
import { answerText } from "../form_elements";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { errorMessage, request, useResource } from "@/ui/api";
import { StatusBadge, SummaryStats } from "@/ui/collection";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import type { InboxMessage, InboxPage } from "../inbox_schemas";
import type { SubmissionDto } from "../form_types";
import { submissionStatuses, type SubmissionStatus } from "../form_schemas";

const statusNames = { new: "New", reviewing: "In progress", closed: "Closed" };

export function ContactsInbox() {
  const params = useSearchParams();
  const formId = params.get("formId") ?? "";
  const initialQuery = params.get("q") ?? "";
  return (
    <InboxWorkspace
      key={`${formId}:${initialQuery}`}
      formId={formId}
      initialQuery={initialQuery}
    />
  );
}

function InboxWorkspace({
  formId,
  initialQuery,
}: {
  formId: string;
  initialQuery: string;
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const [view, setView] = useState<"inbox" | "contacts">("inbox");
  const [search, setSearch] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<InboxMessage>();
  const [selectionRequest, setSelectionRequest] = useState(0);
  const filters = new URLSearchParams({ q: query, page: String(page) });
  if (status) filters.set("status", status);
  if (formId) filters.set("formId", formId);
  if (kind) filters.set("kind", kind);
  if (after) filters.set("after", after);
  if (before) filters.set("before", before);
  const { data, error, refresh } = useResource<InboxPage>(
    `/api/admin/inbox?${filters}`,
  );
  function selectForm(value: string, contactQuery = "") {
    const next = new URLSearchParams();
    if (value) next.set("formId", value);
    if (contactQuery) next.set("q", contactQuery);
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
  return (
    <>
      <PageHeading
        title="Response center"
        description="Review website enquiries, membership applications and event responses in one workspace."
      >
        {user.capabilities.includes("forms.edit") && (
          <Link href="/admin/forms" className="button button-outline">
            Manage forms
          </Link>
        )}
      </PageHeading>
      {formId && (
        <div className="response-form-context" role="status">
          <div>
            <strong>
              Responses for{" "}
              {data?.forms.find((item) => item.id === formId)?.title ??
                "the selected form"}
            </strong>
            <p>Only responses to this form are shown.</p>
          </div>
          <button
            type="button"
            className="button button-outline button-small"
            onClick={() => selectForm("")}
          >
            View all forms
          </button>
        </div>
      )}
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
      {data && (
        <SummaryStats
          label="Matching response counts"
          items={[
            {
              label: "Matching responses",
              value: data.total,
              hint: "Across all matching result pages",
              icon: "mail",
            },
            {
              label: "New",
              value: data.counts.new,
              hint: "Within the current filters",
              icon: "mail",
            },
            {
              label: "In progress",
              value: data.counts.reviewing,
              hint: "Within the current filters",
              icon: "edit",
            },
            {
              label: "Closed",
              value: data.counts.closed,
              hint: "Within the current filters",
              icon: "check",
            },
          ]}
        />
      )}
      <section className="panel inbox-filters">
        <form onSubmit={find} className="inbox-search">
          <label>
            Search contacts and messages
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email or message"
            />
          </label>
          <button className="button button-outline">Search</button>
        </form>
        <label>
          Review status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
              setSelected(undefined);
            }}
          >
            <option value="">All statuses</option>
            {submissionStatuses.map((value) => (
              <option key={value} value={value}>
                {statusNames[value]}
              </option>
            ))}
          </select>
        </label>
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
            {formId && !data?.forms.some((item) => item.id === formId) && (
              <option value={formId}>Selected form</option>
            )}
            {data?.forms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
                {item.eventTitle ? ` · ${item.eventTitle}` : ""}
                {item.archived ? " · archived" : ""}
              </option>
            ))}
          </select>
        </label>
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
            onChange={(e) => {
              setBefore(e.target.value);
              setPage(0);
              setSelected(undefined);
            }}
          />
        </label>
        <button
          type="button"
          className="inline-button"
          onClick={() => {
            setQuery("");
            setSearch("");
            setStatus("");
            selectForm("");
            setKind("");
            setAfter("");
            setBefore("");
            setPage(0);
            setSelected(undefined);
          }}
        >
          Clear filters
        </button>
      </section>
      {error && <Notice>{error}</Notice>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <p className="muted">
            Showing {data.messages.length} · Page {page + 1}
            {formId
              ? ` · ${data.forms.find((item) => item.id === formId)?.title ?? "Selected form"}`
              : " · All permitted forms"}
            . Date filters use UTC.
          </p>
          {view === "contacts" ? (
            <section className="panel">
              <h2>People in this view</h2>
              <p className="field-help">
                Grouped by supplied email. Open a contact to search their
                messages across all forms. Membership and guest access are
                managed separately.
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
                          selectForm("", contact.email!);
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
            <div className="inbox-workspace">
              <section className="panel inbox-messages" aria-label="Responses">
                {!data.messages.length && (
                  <div className="empty-state">
                    <h2>Your inbox is clear</h2>
                    <p>
                      Responses to published forms and event registrations
                      appear here.
                    </p>
                  </div>
                )}
                {data.messages.map((message) => (
                  <button
                    type="button"
                    key={message.id}
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
          <div className="forms-actions">
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
        </>
      )}
    </>
  );
}

function MessagePanel({
  message,
  selectionRequest,
  onSaved,
}: {
  message: InboxMessage;
  selectionRequest: number;
  onSaved: () => void;
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
      {error && <Notice>{error}</Notice>}
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
