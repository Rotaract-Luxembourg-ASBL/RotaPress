"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { errorMessage, request, useResource } from "@/ui/api";
import { Dialog } from "@/ui/dialog";
import { Loading, Notice } from "@/ui/primitives";
import {
  webhookEventLabels,
  webhookEventTypes,
  type LumaWebhookDto,
} from "../webhook_schemas";

const endpoint = "/api/admin/integrations/luma/webhook";
type Operation = "generate" | "save" | "pause" | "remove";
const actionLabels: Record<Operation, string> = {
  generate: "Generate callback URL",
  save: "Save and enable reception",
  pause: "Pause reception",
  remove: "Remove signing secret",
};

export function LumaWebhookPanel() {
  const { data, error, refresh } = useResource<LumaWebhookDto>(endpoint);
  useEffect(() => {
    window.addEventListener("luma-availability-updated", refresh);
    return () =>
      window.removeEventListener("luma-availability-updated", refresh);
  }, [refresh]);
  return (
    <section className="panel form-stack" aria-label="Luma webhooks">
      <div>
        <h2>Webhooks</h2>
        <p>
          Receive signed notifications when Luma events or registrations change.
        </p>
      </div>
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Reload webhooks
          </button>
        </Notice>
      )}
      {!data && !error && <Loading />}
      {data && !error && (
        <WebhookSettings key={data.version} data={data} refresh={refresh} />
      )}
    </section>
  );
}

function WebhookSettings({
  data,
  refresh,
}: {
  data: LumaWebhookDto;
  refresh: () => void;
}) {
  const [secret, setSecret] = useState("");
  const [selected, setSelected] = useState<LumaWebhookDto["eventTypes"]>(
    data.eventTypes.length ? data.eventTypes : [...webhookEventTypes],
  );
  const [review, setReview] = useState<Operation>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [copied, setCopied] = useState(false);
  function open(operation: Operation) {
    setConfirmed(false);
    setProblem(undefined);
    setReview(operation);
  }
  async function save() {
    if (!review) return;
    setBusy(true);
    setProblem(undefined);
    try {
      await request(endpoint, {
        method: "POST",
        body: JSON.stringify({
          operation: review,
          values: {
            expectedVersion: data.version,
            confirmed: true,
            ...(review === "save"
              ? { eventTypes: selected, ...(secret ? { secret } : {}) }
              : {}),
          },
        }),
      });
      setSecret("");
      setReview(undefined);
      refresh();
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p
        className={`status-badge ${data.enabled && data.allowed ? "status-approved" : ""}`}
      >
        {!data.callbackUrl
          ? "Not configured"
          : data.enabled && data.allowed
            ? "Reception enabled"
            : "Reception paused"}
      </p>
      {data.localOnly && (
        <Notice kind="info">
          Local testing only. Luma cannot deliver to this loopback address. Live
          setup needs an authorized public HTTPS installation.
        </Notice>
      )}
      <p>
        Notifications appear below for review. They do not automatically import
        guests, publish events or change booking access. Use the event’s
        existing reconciliation controls to refresh its records.
      </p>
      {!data.callbackUrl ? (
        <div>
          <button
            className="button button-outline"
            onClick={() => open("generate")}
          >
            Generate callback URL
          </button>
        </div>
      ) : (
        <>
          <label>
            Callback URL
            <input
              readOnly
              value={data.callbackUrl}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <div>
            <button
              className="button button-outline button-small"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(data.callbackUrl!);
                  setCopied(true);
                } catch {
                  setProblem("Copy the address from the Callback URL field.");
                }
              }}
            >
              Copy callback URL
            </button>{" "}
            {copied && <span role="status">Copied</span>}
          </div>
          <ol className="webhook-setup-steps">
            <li>
              In Luma, open your calendar’s Settings → Developer → Webhooks.
              Luma Plus is required.
            </li>
            <li>
              Create a webhook with the callback URL and the same event types
              selected here.
            </li>
            <li>
              Copy Luma’s signing secret into the field below, then review and
              enable reception.
            </li>
          </ol>
          <p>
            <a
              href="https://help.luma.com/p/webhooks"
              target="_blank"
              rel="noopener noreferrer"
            >
              Luma webhook setup guide
            </a>
            . Generating this URL does not register anything with Luma.
          </p>
          <fieldset>
            <legend>Event notifications</legend>
            <div className="webhook-event-options">
              {webhookEventTypes.map((type) => (
                <label className="forms-check" key={type}>
                  <input
                    type="checkbox"
                    checked={selected.includes(type)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, type]
                          : selected.filter((t) => t !== type),
                      )
                    }
                  />
                  {webhookEventLabels[type]}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            {data.hasSecret
              ? "Replacement signing secret"
              : "Luma signing secret"}
            <input
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={secret}
              maxLength={246}
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          <p className="muted">
            {data.hasSecret
              ? "A signing secret is stored. Leave the field empty to keep it."
              : "Enter the whsec_ secret generated by Luma, not your calendar API key."}{" "}
            It is encrypted and never displayed again.
          </p>
          {!data.allowed && (
            <Notice kind="info">
              Enable both Luma and Events in Integrations before enabling
              webhook reception.
            </Notice>
          )}
          {!data.encryptionReady && (
            <Notice>
              Integration encryption is unavailable. Restore the installation
              encryption key before saving a secret.
            </Notice>
          )}
          <div className="webhook-actions">
            <button
              className="button button-accent"
              disabled={
                !data.allowed ||
                !data.encryptionReady ||
                !selected.length ||
                (!secret && !data.hasSecret)
              }
              onClick={() => open("save")}
            >
              Review webhook settings
            </button>
            {data.enabled && (
              <button
                className="button button-outline"
                onClick={() => open("pause")}
              >
                Pause reception
              </button>
            )}
            {data.hasSecret && (
              <button
                className="button button-outline"
                onClick={() => open("remove")}
              >
                Remove signing secret
              </button>
            )}
          </div>
        </>
      )}
      {problem && !review && <Notice>{problem}</Notice>}
      <div className="form-stack">
        <div className="webhook-actions">
          <h3>Recent verified notifications</h3>
          <button
            className="button button-outline button-small"
            onClick={refresh}
          >
            Refresh notifications
          </button>
        </div>
        <p className="muted">
          Latest 10 notifications from the last 30 days. Identical payloads are
          combined. Guest details and payment data are not stored here.
        </p>
        {data.receipts.length ? (
          <ul className="webhook-receipts">
            {data.receipts.map((receipt) => (
              <li key={receipt.id}>
                <div>
                  <strong>{webhookEventLabels[receipt.eventType]}</strong>
                  <br />
                  <time dateTime={receipt.receivedAt}>
                    {new Date(receipt.receivedAt).toLocaleString()}
                  </time>
                  {receipt.sourceLabel && (
                    <p className="small">
                      Booking source: {receipt.sourceLabel}
                    </p>
                  )}
                </div>
                {receipt.eventId ? (
                  <Link
                    href={`/admin/events/${receipt.eventId}?tab=participation${receipt.sourceId ? `&sourceId=${encodeURIComponent(receipt.sourceId)}` : ""}`}
                    className="button button-outline button-small"
                  >
                    Review event
                  </Link>
                ) : (
                  <span className="muted">No linked event</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No verified notifications received.</p>
        )}
      </div>
      {review && (
        <Dialog
          title="Review Luma webhook change"
          onClose={() => setReview(undefined)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p>
              <strong>{actionLabels[review]}</strong>
            </p>
            <p>
              {review === "save"
                ? "Store the signing secret and accept the selected signed notifications for this club. No records will be imported automatically."
                : review === "generate"
                  ? "Create a stable callback address for this club. Reception remains paused until a signing secret is saved."
                  : "Stop accepting notifications locally. Existing receipts and event records remain. Pause or remove the subscription separately in Luma."}
            </p>
            <p>
              This makes no request to Luma and does not change event features.
            </p>
            {problem && (
              <Notice>
                {problem}{" "}
                <button
                  className="inline-button"
                  disabled={busy}
                  onClick={() => {
                    setReview(undefined);
                    refresh();
                  }}
                >
                  Reload webhooks
                </button>
              </Notice>
            )}
            <label className="forms-check">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I confirm this webhook change.
            </label>
            <button
              className="button button-accent"
              disabled={busy || !confirmed}
              onClick={save}
            >
              {busy ? "Saving…" : "Confirm webhook change"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
