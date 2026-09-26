"use client";
import Link from "next/link";
import { useState } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { useResource, request, errorMessage } from "@/ui/api";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import { eventModules } from "@/features/events/event_modules";
import type { ProposalDto } from "../proposal_schemas";

const endpoint = "/api/admin/integrations/automation/proposals";
function ProposalSummary({ item }: { item: ProposalDto }) {
  if (item.proposal.kind === "feature") {
    const settings = item.proposal.settings;
    return (
      <p>
        {settings.operation === "enable" ? "Enable" : "Disable"}{" "}
        {eventModules[settings.key].label}.
        {settings.suspendDependents &&
          " Dependent event features will also be suspended."}
        {settings.operation === "disable" &&
          " Existing records are retained; public availability may change."}
      </p>
    );
  }
  const settings = item.proposal.settings;
  return (
    <dl className="detail-list">
      <div>
        <dt>Registration</dt>
        <dd>
          {settings.authority === "native"
            ? "Native free registration"
            : "No registration"}
        </dd>
      </div>
      <div>
        <dt>Capacity</dt>
        <dd>{settings.capacity ?? "No capacity limit"}</dd>
      </div>
      <div>
        <dt>Bookings</dt>
        <dd>
          {settings.open
            ? "Open to new bookings when published requirements are met"
            : "Closed to new bookings"}
        </dd>
      </div>
      {settings.formId && (
        <div>
          <dt>Form</dt>
          <dd>
            <Link href={`/admin/forms/${settings.formId}`}>
              Review the selected registration form
            </Link>
          </dd>
        </div>
      )}
    </dl>
  );
}
export function AutomationReview({ eventId }: { eventId: string }) {
  const { capabilities } = useCurrentUser();
  const allowed = capabilities.includes("integrations.manage");
  const valid = /^[a-f0-9-]{36}$/i.test(eventId);
  const { data, error, refresh } = useResource<{ items: ProposalDto[] }>(
    allowed && valid ? `${endpoint}?eventId=${eventId}` : null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [receipt, setReceipt] = useState("");
  async function review(id: string, action: "apply" | "reject") {
    if (busy) return;
    setBusy(id);
    setProblem("");
    setReceipt("");
    try {
      await request(endpoint, {
        method: "POST",
        body: JSON.stringify({ id, action, confirmed: true }),
      });
      setReceipt(
        action === "apply"
          ? "The reviewed settings were applied. Content publication is unchanged."
          : "Suggestion rejected. Event settings are unchanged.",
      );
      setSelected(null);
      refresh();
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  if (!allowed)
    return (
      <Notice>
        You need permission to manage integrations to review AI suggestions.
      </Notice>
    );
  if (!valid)
    return (
      <Notice>Open the event review link returned by your assistant.</Notice>
    );
  return (
    <>
      <PageHeading
        eyebrow="AI & API"
        title="Review event suggestions"
        description="AI saved these suggestions privately. Applying one changes this event's operational settings immediately; it does not publish content."
      >
        <Link
          className="button button-outline"
          href={`/admin/events/${eventId}`}
        >
          Back to event
        </Link>
      </PageHeading>
      {(error || problem) && <Notice>{problem || error}</Notice>}
      {receipt && <Notice kind="success">{receipt}</Notice>}
      {!data && !error && <Loading />}
      {data && data.items.length === 0 && (
        <div className="panel">
          <h2>No suggestions to review</h2>
          <p>
            Ask your connected assistant to prepare event settings for review.
          </p>
        </div>
      )}
      {data?.items.map((item) => (
        <section
          className="panel"
          key={item.id}
          aria-label={`${item.proposal.kind === "registration" ? "Registration" : "Event feature"} suggestion`}
        >
          <h2>
            {item.eventTitle}:{" "}
            {item.proposal.kind === "registration"
              ? "Registration settings"
              : "Event feature"}
          </h2>
          <p className="muted">
            {item.status === "pending"
              ? "Waiting for your review"
              : item.status === "applied"
                ? "Applied"
                : "Rejected"}{" "}
            · {new Date(item.createdAt).toLocaleString()}
          </p>
          <ProposalSummary item={item} />
          {item.status === "pending" && (
            <>
              <p>
                Changed event settings cause a conflict instead of overwriting
                newer work. A recent sign-in is required.
              </p>
              {selected === item.id ? (
                <div className="notice notice-info">
                  <p>
                    Apply exactly the settings shown above to this event now?
                  </p>
                  <div className="actions">
                    <button
                      className="button button-accent"
                      disabled={Boolean(busy)}
                      onClick={() => void review(item.id, "apply")}
                    >
                      Apply reviewed settings
                    </button>
                    <button
                      className="button button-outline"
                      disabled={Boolean(busy)}
                      onClick={() => setSelected(null)}
                    >
                      Keep reviewing
                    </button>
                  </div>
                </div>
              ) : (
                <div className="actions">
                  <button
                    className="button button-accent"
                    disabled={Boolean(busy)}
                    onClick={() => setSelected(item.id)}
                  >
                    Review and apply
                  </button>
                  <button
                    className="button button-outline"
                    disabled={Boolean(busy)}
                    onClick={() => void review(item.id, "reject")}
                  >
                    Reject suggestion
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ))}
    </>
  );
}
