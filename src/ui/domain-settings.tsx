"use client";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import type { DomainWorkspace } from "@/core/organization/domain_schemas";
import { errorMessage, request, useResource } from "./api";
import { Loading, Notice } from "./primitives";

export function DomainSettings() {
  const params = useSearchParams();
  const [eventId, setEventId] = useState(params.get("event") ?? "");
  const {
    data,
    error: loadError,
    refresh,
  } = useResource<DomainWorkspace>("/api/admin/settings/domains");
  const events = useResource<{
    events: { id: string; title: string; archived: boolean }[];
  }>(data?.canManage ? "/api/admin/events" : null);
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function mutate(input: unknown, method: "POST" | "PATCH") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request("/api/admin/settings/domains", {
        method,
        body: JSON.stringify(input),
      });
      setMessage(
        method === "POST"
          ? "Domain added. Add the DNS record below to verify ownership."
          : "Domain setup updated.",
      );
      if (method === "POST") setHostname("");
      refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      refresh();
    } finally {
      setBusy(false);
    }
  }
  function add(event: FormEvent) {
    event.preventDefault();
    void mutate({ hostname, eventId: eventId || null }, "POST");
  }
  return (
    <section className="form-stack">
      <div className="panel form-stack">
        <p className="eyebrow">Domains</p>
        <h2>Your website address</h2>
        <p>
          Prepare a domain and verify that you control it. Hosting and HTTPS
          must be configured before it becomes the active address.
        </p>
        {loadError && <Notice>{loadError}</Notice>}
        {!data && !loadError && <Loading />}
        {data && (
          <dl className="settings-facts">
            <div>
              <dt>Active application address</dt>
              <dd>{data.origin}</dd>
            </div>
            <div>
              <dt>Google callback</dt>
              <dd>{data.callbackUrl}</dd>
            </div>
          </dl>
        )}
        <p className="field-help">
          The active address comes from the server’s APP_URL setting. DNS
          verification alone does not change sign-in, canonical links or CORS.
        </p>
      </div>
      {error && <Notice>{error}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      {data?.canManage && (
        <form className="panel form-stack" onSubmit={add}>
          <h2>Add a domain</h2>
          <label>
            Destination
            <select
              value={eventId ? "event" : "club"}
              disabled={busy}
              onChange={(e) =>
                setEventId(
                  e.target.value === "club"
                    ? ""
                    : (events.data?.events.find((event) => !event.archived)
                        ?.id ?? "select"),
                )
              }
            >
              <option value="club">Club website</option>
              <option value="event">An individual event</option>
            </select>
          </label>
          {eventId && (
            <label>
              Event
              <select
                value={eventId}
                required
                disabled={busy}
                onChange={(e) => setEventId(e.target.value)}
              >
                <option value="select">Choose an event</option>
                {events.data?.events
                  .filter((event) => !event.archived)
                  .map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
              </select>
              <span className="field-help">
                The event keeps its normal website address and visibility. This
                prepares an optional subdomain.
              </span>
            </label>
          )}
          {events.error && <Notice>{events.error}</Notice>}
          <label>
            Domain name
            <input
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="www.yourclub.org"
              maxLength={253}
              required
              disabled={busy}
            />
          </label>
          <button
            className="button button-accent"
            disabled={busy || !hostname.trim() || eventId === "select"}
          >
            {busy ? "Working…" : "Add domain"}
          </button>
        </form>
      )}
      {data?.items.map((domain) => (
        <article className="panel form-stack" key={domain.id}>
          <div className="settings-row">
            <h3>{domain.hostname}</h3>
            <span className="status-badge">
              {domain.active
                ? "Configured host"
                : domain.verifiedAt
                  ? "DNS verified · hosting pending"
                  : "Awaiting DNS verification"}
            </span>
          </div>
          <p>
            Destination: <strong>{domain.eventTitle ?? "Club website"}</strong>
          </p>
          {domain.eventId && (
            <label>
              Event destination address
              <input
                readOnly
                value={domain.destinationUrl}
                onFocus={(e) => e.target.select()}
              />
              <span className="field-help">
                After verification, configure HTTPS and a redirect from this
                subdomain to the event address at your host. Event sign-in stays
                on the main application.
              </span>
            </label>
          )}
          <p>
            Add this TXT record at your domain provider. Keep it for future
            ownership checks.
          </p>
          <label>
            TXT record name
            <input
              readOnly
              value={domain.recordName}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <label>
            TXT record value
            <input
              readOnly
              value={domain.recordValue}
              onFocus={(e) => e.target.select()}
            />
          </label>
          {domain.verifiedAt && (
            <p className="field-help">
              Last verified {new Date(domain.verifiedAt).toLocaleString()}.
            </p>
          )}
          {data.canManage && (
            <div className="form-actions">
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() =>
                  void mutate({ id: domain.id, operation: "verify" }, "PATCH")
                }
              >
                Check DNS record
              </button>
              {!domain.active && (
                <details>
                  <summary>More actions</summary>
                  <button
                    className="inline-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove setup for ${domain.hostname}? DNS records are not changed.`,
                        )
                      )
                        void mutate(
                          { id: domain.id, operation: "remove" },
                          "PATCH",
                        );
                    }}
                  >
                    Remove domain setup
                  </button>
                </details>
              )}
            </div>
          )}
        </article>
      ))}
      <section className="panel form-stack">
        <h2>When you are ready to connect</h2>
        <ol>
          <li>Point the domain to your chosen host and enable HTTPS.</li>
          <li>
            Set APP_URL to the final HTTPS address and restart the application.
          </li>
          <li>
            Update the Google OAuth redirect URI shown above, then verify
            sign-in.
          </li>
          <li>
            Configure old domains to redirect to the active address at your
            host.
          </li>
        </ol>
        <p className="field-help">
          No hosting provider, DNS changes or public deployment are required for
          local setup.
        </p>
      </section>
    </section>
  );
}
