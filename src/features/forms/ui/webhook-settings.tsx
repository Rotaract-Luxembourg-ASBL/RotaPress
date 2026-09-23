"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { webhookSaveSchema, type WebhookSettings } from "../webhook_schemas";

export function WebhookSettingsPanel({
  formId,
  archived,
}: {
  formId: string;
  archived: boolean;
}) {
  const { data, error } = useResource<WebhookSettings>(
    `/api/admin/forms/${formId}/webhook`,
  );
  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Loading />;
  return <WebhookForm initial={data} formId={formId} archived={archived} />;
}

function WebhookForm({
  initial,
  formId,
  archived,
}: {
  initial: WebhookSettings;
  formId: string;
  archived: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [endpoint, setEndpoint] = useState(initial.endpoint);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  async function save(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);
    const parsed = webhookSaveSchema.safeParse({
      endpoint,
      enabled,
      expectedRevision: saved.revision,
      ...(secret ? { secret } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setBusy(true);
    try {
      const next = await request<WebhookSettings>(
        `/api/admin/forms/${formId}/webhook`,
        { method: "POST", body: JSON.stringify(parsed.data) },
      );
      setSaved(next);
      setSecret("");
      setMessage(
        "Webhook settings saved. Previous queued deliveries were cancelled; these settings apply to new responses.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function retry(deliveryId: string) {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      setSaved(
        await request<WebhookSettings>(
          `/api/admin/forms/${formId}/webhook-retry`,
          { method: "POST", body: JSON.stringify({ deliveryId }) },
        ),
      );
      setMessage("Delivery queued again for the current destination.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel forms-settings">
      <h2>Outgoing webhook</h2>
      <p>
        Notify another application when this form receives a response. Event
        registration forms send a registration notification.
      </p>
      <p className="field-help">
        Notifications contain response identifiers and a private administration
        link. Answers, names and email addresses are not included.
      </p>
      {!saved.deliveryEnabled && (
        <Notice>
          Outgoing delivery is paused for this installation. You can prepare
          settings now; queued notifications stay here until delivery is
          activated.
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      <form onSubmit={save}>
        <fieldset
          className="form-stack forms-fieldset"
          disabled={busy || archived}
        >
          <label>
            Destination URL
            <input
              type="url"
              value={endpoint}
              required
              placeholder="https://your-service.org/hooks/rotapress"
              onChange={(event) => setEndpoint(event.target.value)}
            />
          </label>
          <p className="field-help">
            Use a public HTTPS endpoint. Redirects, private networks and
            credentials in URLs are not supported.
          </p>
          <label>
            {saved.secretConfigured
              ? "Replace signing secret (optional)"
              : "Signing secret"}
            <input
              type="password"
              autoComplete="new-password"
              value={secret}
              minLength={32}
              maxLength={128}
              required={!saved.secretConfigured}
              onChange={(event) => setSecret(event.target.value)}
            />
          </label>
          <p className="field-help">
            Use the same secret in your receiving application. At least 32
            characters; saved secrets are encrypted and never displayed.
          </p>
          <label className="forms-check">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span>Queue notifications for new responses</span>
          </label>
          <button className="button button-accent" disabled={busy}>
            {busy ? "Saving…" : "Save webhook"}
          </button>
        </fieldset>
      </form>
      <details>
        <summary>Delivery format and security</summary>
        <p>
          The receiver verifies the HMAC-SHA256 signature in{" "}
          <code>X-RotaPress-Signature</code> over <code>timestamp.body</code>,
          using <code>X-RotaPress-Timestamp</code>. Deduplicate by{" "}
          <code>X-RotaPress-Id</code> and reject stale timestamps. Return a 2xx
          response to acknowledge delivery.
        </p>
        <p>
          Delivery is retried up to five times. Changing the destination, secret
          or enabled setting cancels older queued deliveries. A request already
          in flight may finish.
        </p>
      </details>
      <h3>Recent deliveries</h3>
      {!saved.deliveries.length ? (
        <p className="muted">
          No webhook deliveries yet. New responses appear after this webhook is
          enabled.
        </p>
      ) : (
        <ul className="forms-list">
          {saved.deliveries.map((delivery) => (
            <li key={delivery.id}>
              <div>
                <Link
                  href={`/admin/forms/${formId}/submissions/${delivery.submissionId}`}
                >
                  View response
                </Link>
                <p className="field-help">
                  {new Date(delivery.createdAt).toLocaleString()} ·{" "}
                  {delivery.status} · {delivery.attempts} attempts
                </p>
                {delivery.errorCode && (
                  <p className="field-help">
                    {delivery.errorCode === "CONFIGURATION_CHANGED"
                      ? "Cancelled after settings changed"
                      : delivery.errorCode === "DELIVERY_NO_LONGER_AUTHORIZED"
                        ? "Stopped because availability changed"
                        : "Delivery was not acknowledged"}
                  </p>
                )}
              </div>
              {delivery.status === "failed" && saved.enabled && (
                <button
                  type="button"
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => retry(delivery.id)}
                >
                  Retry delivery
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
