"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Notice } from "@/ui/primitives";
import { ApiError, errorMessage, request } from "@/ui/api";
import { scopeDefinitions, type AutomationScope } from "../scopes";

export function OAuthConsent({
  signedQuery,
  details,
}: {
  signedQuery: string;
  details: {
    name: string;
    scopes: string[];
    approvedScopes: string[];
    recentlyAuthenticated: boolean;
    sourceOrigins: string[];
    redirectUri: string;
  };
}) {
  const [selected, setSelected] = useState(details.scopes);
  const needsSignIn =
    !details.recentlyAuthenticated &&
    selected.some((scope) => !details.approvedScopes.includes(scope));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [signInRequired, setSignInRequired] = useState(false);
  async function submit(accept: boolean) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await request<{ url: string }>(
        "/api/automation/oauth/consent",
        {
          method: "POST",
          body: JSON.stringify({
            oauth_query: signedQuery,
            accept,
            scopes: selected,
          }),
        },
      );
      window.location.assign(result.url);
    } catch (cause) {
      setError(errorMessage(cause));
      // A session can age or end while this consent page is open. Keep recovery
      // available even when the original server-rendered details were current.
      if (cause instanceof ApiError && cause.status === 401)
        setSignInRequired(true);
      setBusy(false);
    }
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(true);
  }
  return (
    <section
      className="oauth-consent-card"
      aria-labelledby="oauth-consent-title"
    >
      <header className="oauth-consent-heading">
        <p className="eyebrow">AI connection</p>
        <h1 id="oauth-consent-title">
          Allow {details.name} to help your club?
        </h1>
      </header>
      <p>
        The selected actions share club content with this AI client. It can
        prepare private drafts. Select a publishing permission only if you want
        this client to publish when you ask. Participant operations are
        unavailable.
      </p>
      <p>
        Access follows your current staff permissions and ends when you sign
        out, your session expires, or you revoke the connection.
      </p>
      {error && <Notice>{error}</Notice>}
      <form className="oauth-consent-form" onSubmit={onSubmit}>
        <fieldset disabled={busy}>
          <legend>Requested actions</legend>
          <div className="oauth-consent-actions">
            {details.scopes
              .filter((scope) => scope !== "offline_access")
              .map((scope) => (
                <label key={scope} className="oauth-consent-action">
                  <input
                    type="checkbox"
                    checked={selected.includes(scope)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, scope]
                          : current.filter((value) => value !== scope),
                      )
                    }
                  />
                  <span>
                    {scopeDefinitions[scope as AutomationScope]?.label ?? scope}
                  </span>
                </label>
              ))}
          </div>
        </fieldset>
        {details.scopes.includes("offline_access") && (
          <fieldset disabled={busy}>
            <legend>Connection</legend>
            <label className="oauth-consent-action">
              <input
                type="checkbox"
                checked={selected.includes("offline_access")}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, "offline_access"]
                      : current.filter((scope) => scope !== "offline_access"),
                  )
                }
              />
              <span>Keep connected</span>
            </label>
            <p className="oauth-consent-return">
              Renew automatically while your RotaPress sign-in remains active.
              You can revoke access at any time. If turned off, access ends
              within five minutes.
            </p>
          </fieldset>
        )}
        {details.sourceOrigins.length > 0 && (
          <div className="oauth-consent-sources">
            <h2>Approved reference websites</h2>
            <ul>
              {details.sourceOrigins.map((origin) => (
                <li key={origin}>{origin}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="oauth-consent-destination">
          After your choice, return to {details.redirectUri}.
        </p>
        <div className="oauth-consent-buttons">
          {(needsSignIn || signInRequired) && (
            <p role="status">
              {signInRequired
                ? "Your sign-in needs to be renewed to continue."
                : "These new permissions need a recent sign-in."}{" "}
              <Link href={`/api/automation/oauth/sign-in?${signedQuery}`}>
                Sign in to continue
              </Link>
            </p>
          )}
          <button
            className="button button-accent"
            disabled={
              busy ||
              needsSignIn ||
              !selected.some((scope) => scope !== "offline_access")
            }
          >
            {busy ? "Connecting…" : "Allow selected actions"}
          </button>
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={() => void submit(false)}
          >
            Cancel connection
          </button>
        </div>
      </form>
    </section>
  );
}
