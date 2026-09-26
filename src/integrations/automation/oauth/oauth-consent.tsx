"use client";
import { useState, type FormEvent } from "react";
import { Notice } from "@/ui/primitives";
import { errorMessage, request } from "@/ui/api";
import { scopeDefinitions, type AutomationScope } from "../scopes";

export function OAuthConsent({
  signedQuery,
  details,
}: {
  signedQuery: string;
  details: {
    name: string;
    scopes: string[];
    sourceOrigins: string[];
    redirectUri: string;
  };
}) {
  const [selected, setSelected] = useState(
    details.scopes.filter((scope) => scope !== "offline_access"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
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
        prepare private drafts. Publishing and participant operations stay under
        your control.
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
            {details.scopes.map((scope) => (
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
                  {scope === "offline_access"
                    ? "Renew access for up to 8 hours while this staff session remains active"
                    : (scopeDefinitions[scope as AutomationScope]?.label ??
                      scope)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
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
          <button
            className="button button-accent"
            disabled={
              busy || !selected.some((scope) => scope !== "offline_access")
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
