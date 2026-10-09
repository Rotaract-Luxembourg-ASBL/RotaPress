"use client";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Dialog } from "@/ui/dialog";
import { ApiError, errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { StatusBadge } from "@/ui/collection";
import { ScopePicker } from "../ui/scope-picker";
import { ReferenceOrigins, referenceEntries } from "../ui/reference-origins";
import { scopeDefinitions } from "../scopes";
import { readOnlyScopes } from "../permission_context";
import {
  oauthEndpoint,
  connectionStatus,
  ConnectionTime,
  type OAuthClient,
  type OAuthActivity,
} from "./connection-types";

const tabs = ["Permissions", "Activity", "Connection details"] as const;
type Tab = (typeof tabs)[number];

export function ConnectionEditor({
  client,
  initialTab,
  onClose,
  onSaved,
}: {
  client: OAuthClient;
  initialTab: "Permissions" | "Activity";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saved, setSaved] = useState(client);
  const [scopes, setScopes] = useState(client.scopes);
  const [origins, setOrigins] = useState(client.sourceOrigins.join("\n"));
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [receipt, setReceipt] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [discard, setDiscard] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (problem || receipt)
      messageRef.current?.scrollIntoView({ block: "nearest" });
  }, [problem, receipt]);
  useEffect(() => {
    if (discard) discardRef.current?.scrollIntoView({ block: "nearest" });
  }, [discard]);
  const dirty =
    [...scopes].sort().join() !== [...saved.scopes].sort().join() ||
    origins !== saved.sourceOrigins.join("\n");
  const activities = useResource<{ activities: OAuthActivity[] }>(
    `${oauthEndpoint}?clientId=${encodeURIComponent(client.clientId)}`,
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !dirty || conflict) return;
    setBusy(true);
    setProblem(undefined);
    setReceipt(false);
    const sourceOrigins = scopes.includes("sources:read")
      ? referenceEntries(origins)
      : [];
    try {
      const result = await request<{ permissionsRevision: string }>(
        oauthEndpoint,
        {
          method: "PATCH",
          body: JSON.stringify({
            clientId: client.clientId,
            expectedRevision: saved.permissionsRevision,
            scopes,
            sourceOrigins,
          }),
        },
      );
      setSaved({
        ...saved,
        scopes,
        sourceOrigins,
        permissionsRevision: result.permissionsRevision,
        consentedAt: null,
        approvedScopes: [],
      });
      setOrigins(sourceOrigins.join("\n"));
      setReceipt(true);
      onSaved();
      activities.refresh();
    } catch (cause) {
      setProblem(errorMessage(cause));
      setConflict(
        cause instanceof ApiError &&
          cause.status === 409 &&
          cause.message.includes("another tab"),
      );
      setReauth(cause instanceof ApiError && cause.status === 401);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    try {
      const result = await request<{ clients: OAuthClient[] }>(oauthEndpoint);
      const current = result.clients.find(
        (item) => item.clientId === client.clientId,
      );
      if (!current)
        throw new Error(
          "This connection is no longer available. Close this window and refresh the list.",
        );
      setSaved(current);
      setScopes(current.scopes);
      setOrigins(current.sourceOrigins.join("\n"));
      setProblem(undefined);
      setConflict(false);
      setReceipt(false);
      setReauth(false);
      onSaved();
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next]);
    document.getElementById(`oauth-detail-tab-${next}`)?.focus();
  }
  return (
    <Dialog
      title={client.name ?? "OAuth connection"}
      onClose={onClose}
      canClose={() => {
        if (busy) return false;
        if (dirty) {
          setDiscard(true);
          return false;
        }
        return true;
      }}
    >
      <div className="oauth-connection-editor">
        <div className="actions">
          <StatusBadge tone={saved.consentedAt ? "success" : "warning"}>
            {connectionStatus(saved)}
          </StatusBadge>
          <span className="small muted">
            Access follows your current staff permissions.
          </span>
        </div>
        {discard && (
          <div ref={discardRef}>
            <Notice kind="info">
              You have unsaved permission changes.
              <div className="actions">
                <button
                  className="button button-outline"
                  onClick={() => setDiscard(false)}
                >
                  Keep editing
                </button>
                <button className="button button-outline" onClick={onClose}>
                  Discard changes
                </button>
              </div>
            </Notice>
          </div>
        )}
        <div
          role="tablist"
          aria-label="Connection sections"
          className="integration-tabs"
        >
          {tabs.map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              id={`oauth-detail-tab-${index}`}
              aria-selected={tab === label}
              aria-controls={`oauth-detail-panel-${index}`}
              tabIndex={tab === label ? 0 : -1}
              onKeyDown={(event) => keyboard(event, index)}
              onClick={() => {
                setTab(label);
                if (label === "Activity") activities.refresh();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <section
          role="tabpanel"
          id="oauth-detail-panel-0"
          aria-labelledby="oauth-detail-tab-0"
          hidden={tab !== "Permissions"}
        >
          <div className="oauth-consent-summary">
            <strong>
              {saved.approvedScopes.length} actions approved in saved consent
            </strong>
            <p className="small muted">
              {saved.consentedAt
                ? "Saved consent does not guarantee a live connection. Sessions and tokens can expire."
                : "Reconnect in your AI app to review and approve the saved permissions."}
            </p>
            {saved.approvedScopes.length > 0 && (
              <details>
                <summary>View approved actions</summary>
                <ul>
                  {saved.approvedScopes.map((scope) => (
                    <li key={scope}>{scopeDefinitions[scope].label}</li>
                  ))}
                </ul>
              </details>
            )}
            {saved.approvedScopes.length > 0 &&
              saved.approvedScopes.length < saved.scopes.length && (
                <p className="small">
                  {readOnlyScopes(saved.approvedScopes) &&
                    !readOnlyScopes(saved.scopes) &&
                    "Saved consent is read-only, even though draft actions are allowed in these settings. "}
                  The app has fewer approved actions than this connection
                  allows. Reconnect in the AI app and choose{" "}
                  <strong>Review all allowed actions</strong> on the consent
                  screen to approve the other permissions.
                </p>
              )}
          </div>
          <div className="oauth-save-messages" ref={messageRef}>
            {receipt && !dirty && (
              <Notice kind="success">
                Permissions saved. Reconnect in your AI app and approve access
                again using the same client ID and secret.
              </Notice>
            )}
            {problem && (
              <Notice>
                {problem}
                {conflict && (
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => void reload()}
                  >
                    Discard edits and reload permissions
                  </button>
                )}
                {reauth && (
                  <Link
                    href="/sign-in?reauth=1&next=%2Fadmin%2Fintegrations%2Fmcp%3Ftab%3Dexisting"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Sign in again in a new tab, then retry saving
                  </Link>
                )}
              </Notice>
            )}
          </div>
          <form className="automation-form" onSubmit={save}>
            <ScopePicker
              legend="Connection permissions"
              value={scopes}
              onChange={setScopes}
              disabled={busy || saved.disabled}
            />
            {scopes.includes("sources:read") && (
              <ReferenceOrigins
                value={origins}
                onChange={setOrigins}
                disabled={busy || saved.disabled}
              />
            )}
            <div className="oauth-save-bar">
              <p className="small">
                Saving stops this app's current access and requires fresh
                consent. Your client ID, secret and callback stay the same.
              </p>
              <div className="actions">
                <button
                  className="button button-accent"
                  disabled={
                    busy ||
                    !dirty ||
                    !scopes.length ||
                    conflict ||
                    saved.disabled
                  }
                >
                  {busy ? "Saving…" : "Save permissions"}
                </button>
                <span role="status" className="small muted">
                  {dirty ? "Unsaved changes" : "All changes saved"}
                </span>
              </div>
              <p className="small muted">
                Identity confirmation lasts 12 hours in the same browser and
                network.
              </p>
            </div>
          </form>
        </section>
        <section
          role="tabpanel"
          id="oauth-detail-panel-1"
          aria-labelledby="oauth-detail-tab-1"
          hidden={tab !== "Activity"}
        >
          <div className="oauth-activity-heading">
            <div>
              <h3>Recent activity</h3>
              <p className="small muted">
                Latest 30 recorded events for this connection. Tool history
                starts with this version; prompts and content are never stored
                here.
              </p>
            </div>
            <button
              className="button button-outline"
              onClick={activities.refresh}
            >
              Refresh activity
            </button>
          </div>
          {activities.error ? (
            <Notice>{activities.error}</Notice>
          ) : !activities.data ? (
            <Loading />
          ) : !activities.data.activities.length ? (
            <p>No activity recorded for this connection yet.</p>
          ) : (
            <ol className="oauth-activity-list">
              {activities.data.activities.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{activityLabel(item.action)}</strong>
                    <span className="small muted">
                      <ConnectionTime value={item.at} />
                    </span>
                  </div>
                  {item.action.startsWith("automation.tool.") && (
                    <StatusBadge
                      tone={
                        item.action.includes(".succeeded.")
                          ? "success"
                          : "danger"
                      }
                    >
                      {item.action.includes(".succeeded.")
                        ? "Completed"
                        : "Failed"}
                    </StatusBadge>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section
          role="tabpanel"
          id="oauth-detail-panel-2"
          aria-labelledby="oauth-detail-tab-2"
          hidden={tab !== "Connection details"}
        >
          <dl className="oauth-connection-details">
            <div>
              <dt>Created</dt>
              <dd>
                <ConnectionTime value={saved.createdAt} />
              </dd>
            </div>
            <div>
              <dt>Last recorded tool call</dt>
              <dd>
                <ConnectionTime
                  value={saved.lastUsedAt}
                  empty="No tool activity recorded"
                />
              </dd>
            </div>
            <div>
              <dt>Client ID</dt>
              <dd>
                <code>{saved.clientId}</code>
              </dd>
            </div>
            <div>
              <dt>Callback URLs</dt>
              <dd>
                {saved.redirectUris.map((uri) => (
                  <p key={uri}>{uri}</p>
                ))}
              </dd>
            </div>
            <div>
              <dt>Authentication</dt>
              <dd>
                {saved.authentication === "none"
                  ? "Public client with PKCE"
                  : "Client ID and secret"}
              </dd>
            </div>
          </dl>
          <p className="small muted">
            The secret is shown only when the connection is created. To change
            callbacks or replace a lost secret, create a new connection.
          </p>
        </section>
      </div>
    </Dialog>
  );
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    "automation.oauth.created": "Connection created",
    "automation.oauth.authorized": "Access approved",
    "automation.oauth.denied": "Access declined",
    "automation.oauth.permissions_updated":
      "Permissions updated · reconnect required",
  };
  if (labels[action]) return labels[action];
  if (action.startsWith("automation.tool.")) {
    const name = action.split(".").slice(3).join(".").replaceAll("_", " ");
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return "Connection updated";
}
