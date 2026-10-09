"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Notice } from "@/ui/primitives";
import { ApiError, errorMessage, request } from "@/ui/api";
import { scopeDefinitions, type AutomationScope } from "../scopes";
import { readOnlyScopes } from "../permission_context";
import { ReferenceCoverage } from "../ui/reference-origins";

const actionGroups = [
  { prefix: "website:", name: "Website" },
  { prefix: "media:", name: "Images" },
  { prefix: "projects:", name: "Projects" },
  { prefix: "events:", name: "Events" },
  { prefix: "forms:", name: "Forms" },
  { prefix: "directory:", name: "Directory" },
  { prefix: "calendar:", name: "Calendar" },
  { prefix: "sources:", name: "Reference websites" },
];

type PendingAction = "review" | "allow" | "cancel";

export function OAuthConsent({
  signedQuery,
  details,
  clubName,
}: {
  signedQuery: string;
  clubName: string;
  details: {
    name: string;
    scopes: string[];
    allowedScopes: string[];
    approvedScopes: string[];
    recentlyAuthenticated: boolean;
    identityConfirmationRequired: boolean;
    sourceOrigins: string[];
    redirectUri: string;
    permissionsRevision: string;
  };
}) {
  const [selected, setSelected] = useState(details.scopes);
  const [pending, setPending] = useState<PendingAction>();
  const [error, setError] = useState<string>();
  const [signInRequired, setSignInRequired] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const labelPrefix = useId();
  const busy = pending !== undefined;
  const needsSignIn =
    details.identityConfirmationRequired ||
    (!details.recentlyAuthenticated &&
      selected.some((scope) => !details.approvedScopes.includes(scope)));
  const actions = details.scopes.filter((scope) => scope !== "offline_access");
  const allowedActions = details.allowedScopes.filter(
    (scope) => scope !== "offline_access",
  );
  const selectedActions = selected.filter(
    (scope) => scope !== "offline_access",
  );
  const readOnly = readOnlyScopes(selectedActions);
  const publication = selectedActions.some((scope) =>
    scope.endsWith(":publish"),
  );
  const callbackHost = URL.canParse(details.redirectUri)
    ? new URL(details.redirectUri).host
    : details.redirectUri;
  const groups = actionGroups
    .map((group) => ({
      ...group,
      scopes: actions.filter((scope) => scope.startsWith(group.prefix)),
    }))
    .filter((group) => group.scopes.length > 0);
  const otherScopes = actions.filter(
    (scope) => !actionGroups.some((group) => scope.startsWith(group.prefix)),
  );
  if (otherScopes.length)
    groups.push({
      prefix: "other",
      name: "Other actions",
      scopes: otherScopes,
    });

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [error]);

  function failed(cause: unknown) {
    setError(errorMessage(cause));
    if (cause instanceof ApiError && cause.status === 401)
      setSignInRequired(true);
    if (cause instanceof ApiError && cause.status === 409)
      setReloadRequired(true);
    setPending(undefined);
  }

  async function reviewAllowed() {
    if (busy) return;
    setPending("review");
    setError(undefined);
    try {
      const result = await request<{ url: string }>(
        "/api/automation/oauth/review",
        {
          method: "POST",
          body: JSON.stringify({
            oauth_query: signedQuery,
            expectedRevision: details.permissionsRevision,
          }),
        },
      );
      window.location.assign(result.url);
    } catch (cause) {
      failed(cause);
    }
  }

  async function submit(accept: boolean) {
    if (busy) return;
    setPending(accept ? "allow" : "cancel");
    setError(undefined);
    try {
      const result = await request<{ url: string }>(
        "/api/automation/oauth/consent",
        {
          method: "POST",
          body: JSON.stringify({
            oauth_query: signedQuery,
            expectedRevision: details.permissionsRevision,
            accept,
            scopes: selected,
          }),
        },
      );
      window.location.assign(result.url);
    } catch (cause) {
      failed(cause);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(true);
  }

  function toggle(scope: string, checked: boolean) {
    setSelected((current) =>
      checked
        ? current.includes(scope)
          ? current
          : [...current, scope]
        : current.filter((value) => value !== scope),
    );
  }

  return (
    <section
      className="oauth-consent-card"
      aria-labelledby="oauth-consent-title"
      aria-busy={busy}
    >
      <ol className="oauth-consent-progress" aria-label="Connection progress">
        <li>
          <span aria-hidden="true">1</span> Sign in
        </li>
        <li aria-current="step">
          <span aria-hidden="true">2</span> Review access
        </li>
        <li>
          <span aria-hidden="true">3</span> Return to app
        </li>
      </ol>
      <header className="oauth-consent-heading">
        <p className="eyebrow">Review permissions</p>
        <h1 id="oauth-consent-title">
          Allow {details.name} to help your club?
        </h1>
        <p>
          Choose what this app can do. Only the actions you select are granted.
        </p>
      </header>
      <div className="oauth-consent-connection" aria-label="Connection details">
        <div>
          <span>AI app</span>
          <strong>{details.name}</strong>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <span>Club</span>
          <strong>{clubName}</strong>
        </div>
      </div>
      {error && (
        <div ref={errorRef} tabIndex={-1} className="oauth-consent-error">
          <Notice>
            <strong>{error}</strong>
            <p>Your action selections have been kept.</p>
            {reloadRequired && (
              <button
                type="button"
                className="inline-button"
                onClick={() => window.location.reload()}
              >
                Reload and review permissions
              </button>
            )}
          </Notice>
        </div>
      )}
      {actions.length < allowedActions.length && (
        <aside
          className="oauth-consent-request"
          aria-label="Permission request"
        >
          <div>
            <strong>
              The app requested {actions.length} of {allowedActions.length}{" "}
              allowed actions.
            </strong>
            <p>
              {readOnlyScopes(actions) &&
                !readOnlyScopes(allowedActions) &&
                "The app requested read-only access, so it cannot prepare drafts with this selection. "}
              Approve this smaller selection, or review the other actions
              already allowed in your connection settings. Nothing is added
              without your approval.
            </p>
          </div>
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={() => void reviewAllowed()}
          >
            {pending === "review"
              ? "Opening review…"
              : "Review all allowed actions"}
          </button>
        </aside>
      )}
      <form className="oauth-consent-form" onSubmit={onSubmit}>
        <div className="oauth-consent-summary" role="status" aria-live="polite">
          <div>
            <strong>
              {selectedActions.length}{" "}
              {selectedActions.length === 1 ? "action" : "actions"} selected
              {selectedActions.length > 0 && readOnly
                ? " · Read-only access"
                : ""}
            </strong>
            <p>
              {!selectedActions.length
                ? "Select at least one action to continue."
                : readOnly
                  ? "This selection cannot edit or publish content."
                  : publication
                    ? "Publication is available only for selected areas and your explicit requests."
                    : "The app can prepare changes that remain private drafts."}
            </p>
          </div>
          {selectedActions.length > 0 && (
            <span
              className="oauth-consent-mode"
              data-mode={publication ? "publish" : readOnly ? "read" : "draft"}
            >
              {publication
                ? "Publication enabled"
                : readOnly
                  ? "Read only"
                  : "Draft editing"}
            </span>
          )}
        </div>
        <fieldset disabled={busy} className="oauth-consent-requested">
          <legend>Requested actions</legend>
          <p className="oauth-consent-section-hint">
            Reads may include private drafts. Participant records are never
            included.
          </p>
          <div className="oauth-consent-groups">
            {groups.map((group) => (
              <fieldset key={group.prefix} className="oauth-consent-group">
                <legend>{group.name}</legend>
                <div className="oauth-consent-actions">
                  {group.scopes.map((scope) => (
                    <label key={scope} className="oauth-consent-action">
                      <input
                        type="checkbox"
                        checked={selected.includes(scope)}
                        onChange={(event) =>
                          toggle(scope, event.target.checked)
                        }
                        aria-labelledby={`${labelPrefix}-${scope}`}
                      />
                      <span className="oauth-consent-action-copy">
                        <span id={`${labelPrefix}-${scope}`}>
                          {scopeDefinitions[scope as AutomationScope]?.label ??
                            scope}
                        </span>
                        <span
                          className="oauth-consent-action-kind"
                          data-kind={
                            scope.endsWith(":publish")
                              ? "publish"
                              : readOnlyScopes([scope])
                                ? "read"
                                : "draft"
                          }
                          aria-hidden="true"
                        >
                          {scope.endsWith(":publish")
                            ? "Publish"
                            : readOnlyScopes([scope])
                              ? "Read"
                              : "Draft"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </fieldset>
        {publication && (
          <aside
            className="oauth-consent-publication"
            aria-label="Publication permissions"
          >
            <strong>Publication needs your explicit request</strong>
            <p>
              These actions allow publishing exact reviewed targets. Selecting
              them does not publish anything now.
            </p>
            {selected.includes("media:publish") && (
              <p>
                Published image files and metadata become public, even before a
                page uses them.
              </p>
            )}
            {(selected.includes("calendar:publish") ||
              selected.includes("forms:publish")) && (
              <p>
                {selected.includes("calendar:publish") &&
                  "Published activities may notify subscribers. "}
                {selected.includes("forms:publish") &&
                  "Published forms may accept responses."}
              </p>
            )}
          </aside>
        )}
        {selected.includes("sources:read") &&
          details.sourceOrigins.length > 0 && (
            <section
              className="oauth-consent-sources"
              aria-labelledby={`${labelPrefix}-sources`}
            >
              <h2 id={`${labelPrefix}-sources`}>Reference website coverage</h2>
              <ReferenceCoverage rules={details.sourceOrigins} />
            </section>
          )}
        {details.scopes.includes("offline_access") && (
          <fieldset disabled={busy} className="oauth-consent-renewal">
            <legend>Stay connected</legend>
            <label className="oauth-consent-action">
              <input
                type="checkbox"
                checked={selected.includes("offline_access")}
                onChange={(event) =>
                  toggle("offline_access", event.target.checked)
                }
                aria-describedby={`${labelPrefix}-renewal`}
              />
              <span>Keep connected</span>
            </label>
            <p id={`${labelPrefix}-renewal`} className="oauth-consent-return">
              Renew automatically while your RotaPress sign-in remains active.
              Revoke access at any time. If turned off, access ends within five
              minutes.
            </p>
          </fieldset>
        )}
        <div className="oauth-consent-destination">
          <span>After your choice, return to</span>
          <strong>{callbackHost}</strong>
          <details>
            <summary>View exact return URL</summary>
            <code>{details.redirectUri}</code>
          </details>
        </div>
        {(needsSignIn || signInRequired) && (
          <div className="oauth-consent-reauth" role="status">
            <p>
              {signInRequired
                ? "Your sign-in needs to be renewed to continue."
                : "These new permissions need a recent sign-in."}
            </p>
            <Link href={`/api/automation/oauth/sign-in?${signedQuery}`}>
              Sign in to continue
            </Link>
          </div>
        )}
        <div className="oauth-consent-buttons">
          <button
            className="button button-accent"
            disabled={
              busy ||
              needsSignIn ||
              signInRequired ||
              reloadRequired ||
              !selectedActions.length
            }
          >
            {pending === "allow" ? "Connecting…" : "Allow selected actions"}
          </button>
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={() => void submit(false)}
          >
            {pending === "cancel" ? "Cancelling…" : "Cancel connection"}
          </button>
        </div>
        {pending && (
          <p className="oauth-consent-return" role="status" aria-live="polite">
            {pending === "review"
              ? "Opening the full permission review…"
              : pending === "allow"
                ? "Connecting your app with the selected actions…"
                : "Cancelling this connection and returning to your app…"}
          </p>
        )}
        <p className="oauth-consent-return">
          Access follows your current staff permissions. It ends when you sign
          out, your session expires, or you revoke this connection.
        </p>
      </form>
    </section>
  );
}
