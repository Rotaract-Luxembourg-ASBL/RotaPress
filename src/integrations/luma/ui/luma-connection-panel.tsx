"use client";
import { useEffect, useState } from "react";
import { request, useResource, errorMessage } from "@/ui/api";
import { Dialog } from "@/ui/dialog";
import { Notice, Loading } from "@/ui/primitives";
import {
  connectionStateLabels,
  type LumaConnectionDto,
} from "../connection_schemas";

const endpoint = "/api/admin/integrations/luma/connection";
export function LumaConnectionPanel() {
  const { data, error, refresh } = useResource<LumaConnectionDto>(endpoint);
  const [apiKey, setApiKey] = useState("");
  const [review, setReview] = useState<"save" | "check" | "disconnect">();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [receipt, setReceipt] = useState<string>();
  useEffect(() => {
    window.addEventListener("luma-availability-updated", refresh);
    return () =>
      window.removeEventListener("luma-availability-updated", refresh);
  }, [refresh]);
  function open(operation: NonNullable<typeof review>) {
    setReview(operation);
    setConfirmed(false);
    setProblem(undefined);
    setReceipt(undefined);
  }
  return (
    <section className="panel form-stack" aria-label="Luma API connection">
      <div>
        <h2>Luma API connection</h2>
        <p>
          Store one calendar key for the club and check its access separately.
          Registration links work without an API connection.
        </p>
      </div>
      {error && <Notice>{error}</Notice>}
      {!data ? (
        !error && <Loading />
      ) : (
        <>
          <p className="status-badge">{connectionStateLabels[data.state]}</p>
          {data.mode === "fixture" && (
            <Notice kind="info">
              Synthetic local provider fixture. This is not live Luma
              verification.
            </Notice>
          )}
          {data.mode === "blocked" && (
            <Notice kind="info">
              Live API checks are blocked on this installation until separately
              authorized and configured.
            </Notice>
          )}
          {!data.encryptionReady && (
            <Notice kind="info">
              Credential storage is unavailable until local setup provides the
              installation encryption key.
            </Notice>
          )}
          {data.message && <Notice>{data.message}</Notice>}
          {receipt && <Notice kind="success">{receipt}</Notice>}
          <dl className="forms-two-fields">
            <div>
              <dt>API key</dt>
              <dd>
                {data.hasCredential
                  ? "•••••••• · stored securely"
                  : "Not saved"}
              </dd>
            </div>
            {data.calendarId && (
              <div>
                <dt>Selected calendar</dt>
                <dd className="break-words">{data.calendarId}</dd>
              </div>
            )}
            {data.checkedAt && (
              <div>
                <dt>Latest check completed</dt>
                <dd>{new Date(data.checkedAt).toLocaleString()}</dd>
              </div>
            )}
            {data.lastSuccessAt && (
              <div>
                <dt>Last successful check</dt>
                <dd>
                  {new Date(data.lastSuccessAt).toLocaleString()} · historical
                  result
                </dd>
              </div>
            )}
          </dl>
          <p>
            Saving or replacing a key makes no provider request and enables no
            event feature. The first successful check selects the calendar;
            later keys must match it. Event managers explicitly link and
            reconcile guests from their own event workspace.
          </p>
          <label className="field">
            <span>
              {data.hasCredential ? "Replacement API key" : "Calendar API key"}
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={apiKey}
              maxLength={512}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={busy || !data.encryptionReady}
            />
          </label>
          <div className="forms-actions">
            <button
              className="button button-accent"
              disabled={
                busy || !data.encryptionReady || apiKey.trim().length < 16
              }
              onClick={() => open("save")}
            >
              {data.hasCredential
                ? "Review key replacement"
                : "Review saving API key"}
            </button>
            <button
              className="button button-outline"
              disabled={
                busy ||
                !data.hasCredential ||
                !data.allowed ||
                data.mode === "blocked"
              }
              onClick={() => open("check")}
            >
              Review connection check
            </button>
            {data.hasCredential && (
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => open("disconnect")}
              >
                Review disconnect
              </button>
            )}
          </div>
          {!data.allowed && (
            <p className="muted">
              Enable Luma above before checking API access.
            </p>
          )}
          {review && (
            <Dialog
              title={
                review === "save"
                  ? "Review API key storage"
                  : review === "check"
                    ? "Review API connection check"
                    : "Review API disconnect"
              }
              onClose={() => setReview(undefined)}
              canClose={() => !busy}
            >
              <div className="form-stack">
                <p>
                  {review === "save"
                    ? "Save this key encrypted for the club. Any current key is replaced and its verification is reset. The selected calendar and published registration links are retained."
                    : review === "disconnect"
                      ? "Remove the stored API key immediately and invalidate any unfinished check. The calendar identity, audit history and published registration links remain. This does not revoke the key at Luma."
                      : data.mode === "fixture"
                        ? "Send the saved synthetic key to the local test server and verify its calendar response. No request goes to Luma."
                        : "Send the saved key to Luma to check calendar access. This read-only request does not import guests or change provider events."}
                </p>
                {review === "check" && (
                  <p>
                    Checks are limited to one per minute. A result applies only
                    to the current saved key.
                  </p>
                )}
                {problem && (
                  <Notice>
                    {problem}{" "}
                    <button
                      className="inline-button"
                      onClick={() => {
                        setReview(undefined);
                        refresh();
                      }}
                    >
                      Reload connection
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
                  I confirm this API connection action.
                </label>
                <button
                  className="button button-accent"
                  disabled={busy || !confirmed}
                  onClick={async () => {
                    setBusy(true);
                    setProblem(undefined);
                    try {
                      const result = await request<LumaConnectionDto>(
                        endpoint,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            operation: review,
                            values: {
                              expectedVersion: data.version,
                              confirmed: true,
                              ...(review === "save" ? { apiKey } : {}),
                            },
                          }),
                        },
                      );
                      if (review === "save" || review === "disconnect")
                        setApiKey("");
                      setReceipt(
                        review === "save"
                          ? "API key saved securely. No provider request was made."
                          : review === "disconnect"
                            ? "API key removed. Published registration links are unchanged."
                            : result.state === "verified"
                              ? result.mode === "fixture"
                                ? "Synthetic connection check passed."
                                : "Calendar access checked."
                              : undefined,
                      );
                      setReview(undefined);
                      refresh();
                    } catch (cause) {
                      setProblem(errorMessage(cause));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Working…" : "Confirm API connection action"}
                </button>
              </div>
            </Dialog>
          )}
        </>
      )}
    </section>
  );
}
