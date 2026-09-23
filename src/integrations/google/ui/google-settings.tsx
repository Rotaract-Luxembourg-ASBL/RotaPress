"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient } from "@/core/auth/client";
import {
  googleAuthSaveSchema,
  type GoogleAuthSettings,
} from "@/core/auth/google_auth_schemas";
import { useCurrentUser } from "@/ui/admin-shell";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import { GoogleSetupGuide } from "./google-setup-guide";
import {
  GoogleSettingsReview,
  type GoogleReview,
} from "./google-settings-review";

const endpoint = "/api/admin/integrations/google";
const returnPath = "/admin/integrations/google";

function GoogleSettingsEditor({ initial }: { initial: GoogleAuthSettings }) {
  const [saved, setSaved] = useState(initial);
  const [clientId, setClientId] = useState(initial.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [review, setReview] = useState<GoogleReview>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [problem, setProblem] = useState<string>();
  const [receipt, setReceipt] = useState<string>();
  const dirty = clientId !== saved.clientId || clientSecret !== "";
  const secretRequired = !saved.hasSecret || clientId.trim() !== saved.clientId;
  const editingBlocked =
    !saved.canManage || !saved.encryptionReady || saved.staffRequiresGoogle;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function canLeave() {
    return (
      !busy &&
      (!dirty ||
        window.confirm("Leave without saving your entered Google credentials?"))
    );
  }
  function accept(next: GoogleAuthSettings) {
    setSaved(next);
    setClientId(next.clientId);
    setClientSecret("");
  }
  function open(action: GoogleReview) {
    setProblem(undefined);
    setReceipt(undefined);
    setReview(action);
  }
  function reviewCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || editingBlocked) return;
    const result = googleAuthSaveSchema.safeParse({
      expectedVersion: saved.version,
      clientId,
      ...(clientSecret ? { clientSecret } : {}),
    });
    if (!result.success) {
      setProblem(result.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    open("save");
  }
  async function reload() {
    if (
      inFlight.current ||
      (dirty &&
        !window.confirm(
          "Discard your entered credentials and reload the saved Google settings?",
        ))
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setProblem(undefined);
    try {
      accept(await request<GoogleAuthSettings>(endpoint));
      setReview(undefined);
      setReceipt("Saved Google settings reloaded.");
    } catch (cause) {
      setProblem(`${errorMessage(cause)} Your entered values are preserved.`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function confirm() {
    if (!review || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(undefined);
    try {
      const operation =
        review === "save" || review === "disconnect" ? review : "setEnabled";
      const next = await request<GoogleAuthSettings>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          operation,
          values: {
            expectedVersion: saved.version,
            ...(review === "save"
              ? {
                  clientId: clientId.trim(),
                  ...(clientSecret ? { clientSecret } : {}),
                }
              : {
                  confirmed: true,
                  ...(operation === "setEnabled"
                    ? { enabled: review === "enable" }
                    : {}),
                }),
          },
        }),
      });
      accept(next);
      const message =
        review === "save"
          ? "Credentials saved securely. Google sign-in is disabled. Enable it, then complete a Google sign-in to verify the connection."
          : review === "enable"
            ? "Google sign-in enabled. Complete the verification step below."
            : review === "disable"
              ? "Google sign-in disabled. Saved credentials have been retained."
              : "Google credentials removed. Google sign-in is disabled and environment credentials will not be used.";
      setReceipt(`${message} Previous Google sessions must sign in again.`);
      setReview(undefined);
    } catch (cause) {
      setProblem(
        `${errorMessage(cause)} Your entered values are preserved. Reload settings if another owner changed the connection.`,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function verify() {
    if (inFlight.current || !saved.enabled || dirty) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(undefined);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: returnPath,
      });
      if (result.error)
        throw new Error(
          "Google sign-in could not start. Reload the saved settings and try again.",
        );
    } catch (cause) {
      setProblem(errorMessage(cause));
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div
      className="form-stack integration-settings google-settings"
      aria-busy={busy}
    >
      <div className="button-row">
        <Link
          href="/admin/integrations"
          className="button button-outline"
          onClick={(event) => {
            if (!canLeave()) event.preventDefault();
          }}
        >
          All integrations
        </Link>
        <button
          type="button"
          className="button button-outline"
          disabled={busy}
          onClick={() => void reload()}
        >
          Reload Google settings
        </button>
      </div>
      {receipt && <Notice kind="success">{receipt}</Notice>}
      {problem && !review && (
        <Notice>
          {problem}{" "}
          <Link
            href={`/sign-in?next=${returnPath}`}
            onClick={(event) => {
              if (!canLeave()) event.preventDefault();
            }}
          >
            Sign in again
          </Link>
        </Notice>
      )}
      <section
        className="panel form-stack"
        aria-label="Saved Google connection"
      >
        <div className="google-settings-status">
          <h2>Google sign-in</h2>
          <span
            className={`status-badge ${saved.enabled ? "status-approved" : ""}`}
          >
            {saved.enabled
              ? "Enabled"
              : saved.configured
                ? "Saved · disabled"
                : "Not configured"}
          </span>
        </div>
        <dl className="google-connection-facts">
          <div>
            <dt>Client secret</dt>
            <dd>
              {saved.hasSecret ? "Configured · never displayed" : "Not saved"}
            </dd>
          </div>
          <div>
            <dt>Successful Google sign-in</dt>
            <dd>
              {saved.verifiedAt
                ? new Date(saved.verifiedAt).toLocaleString()
                : "Not yet verified"}
            </dd>
          </div>
        </dl>
        {!saved.canManage && (
          <Notice kind="info">
            Only a club owner can change Google credentials or availability. You
            can review the saved configuration here.
          </Notice>
        )}
        {saved.staffRequiresGoogle && (
          <Notice kind="info">
            Staff are required to sign in with Google. Change the staff sign-in
            policy in{" "}
            <Link
              href="/admin/settings"
              onClick={(event) => {
                if (!canLeave()) event.preventDefault();
              }}
            >
              Settings
            </Link>{" "}
            before replacing, disabling or removing this connection.
          </Notice>
        )}
      </section>
      <GoogleSetupGuide settings={saved} />
      <section
        className="panel form-stack"
        aria-label="Google OAuth credentials"
      >
        <div>
          <h2>3. Save credentials</h2>
          <p>
            Copy the client ID and client secret from your Google OAuth web
            client. Saving always leaves Google sign-in disabled until you
            enable it below.
          </p>
        </div>
        {!saved.encryptionReady && (
          <Notice kind="info">
            Secure credential storage is unavailable. Ask the installation
            operator to configure encryption before saving credentials.
          </Notice>
        )}
        <form className="form-stack" onSubmit={reviewCredentials}>
          <fieldset
            className="form-stack forms-fieldset"
            disabled={busy || editingBlocked}
          >
            <label className="field">
              Google client ID
              <input
                autoComplete="off"
                value={clientId}
                maxLength={300}
                required
                spellCheck={false}
                placeholder="Your client ID ending in .apps.googleusercontent.com"
                onChange={(event) => {
                  setClientId(event.target.value);
                  setReceipt(undefined);
                }}
              />
            </label>
            <label className="field">
              {saved.hasSecret
                ? "Replacement client secret"
                : "Google client secret"}
              <input
                type="password"
                autoComplete="new-password"
                value={clientSecret}
                minLength={16}
                maxLength={512}
                required={secretRequired}
                onChange={(event) => {
                  setClientSecret(event.target.value);
                  setReceipt(undefined);
                }}
              />
            </label>
            <p className="field-help">
              {secretRequired
                ? "A client secret is required for this client ID."
                : "Leave the secret blank to keep it for the same client ID. Changing the client ID requires a new secret."}{" "}
              Secrets are encrypted and cleared from this form after saving.
            </p>
            <div>
              <button className="button button-accent" disabled={!dirty}>
                Review and save credentials
              </button>
            </div>
          </fieldset>
        </form>
        <p className="field-help">
          Changes require a recent owner sign-in and sign out previous Google
          sessions.
        </p>
      </section>
      <section
        className="panel form-stack"
        aria-label="Google sign-in availability"
      >
        <div>
          <h2>4. Enable Google sign-in</h2>
          <p>
            Enabling makes Google available to people signing in. It does not
            approve club membership or change staff permissions.
          </p>
        </div>
        {!saved.configured && (
          <p className="field-help">Save the Google credentials first.</p>
        )}
        {dirty && (
          <p className="field-help">
            Save or discard your entered credentials before changing
            availability or verifying the saved connection.
          </p>
        )}
        <div>
          <button
            type="button"
            className="button button-outline"
            disabled={
              busy ||
              dirty ||
              !saved.canManage ||
              !saved.configured ||
              !saved.hasSecret ||
              (saved.enabled && saved.staffRequiresGoogle)
            }
            onClick={() => open(saved.enabled ? "disable" : "enable")}
          >
            {saved.enabled
              ? "Review disabling Google"
              : "Review enabling Google"}
          </button>
        </div>
        <details className="google-connection-actions">
          <summary>Connection actions</summary>
          <p>
            Remove the credentials from RotaPress and stop Google sign-in. This
            keeps the installation from falling back to environment credentials.
          </p>
          <button
            type="button"
            className="button button-outline"
            disabled={
              busy ||
              dirty ||
              !saved.canManage ||
              !saved.configured ||
              saved.staffRequiresGoogle
            }
            onClick={() => open("disconnect")}
          >
            Review removing credentials
          </button>
        </details>
      </section>
      <section className="panel form-stack" aria-label="Verify Google sign-in">
        <div>
          <h2>5. Verify with Google</h2>
          <p>
            Continue to Google's real sign-in flow using the saved, enabled
            connection. After a successful return, this page shows the recorded
            verification time.
          </p>
        </div>
        <p className="field-help">
          Use the Google account belonging to your club owner or administrator.
          A saved client ID or enabled switch alone does not prove a successful
          connection.
        </p>
        <div>
          <button
            type="button"
            className="button button-accent"
            disabled={busy || dirty || !saved.enabled}
            onClick={() => void verify()}
          >
            Continue with Google to verify
          </button>
        </div>
      </section>
      {review && (
        <GoogleSettingsReview
          key={review}
          action={review}
          busy={busy}
          error={problem}
          onClose={() => setReview(undefined)}
          onConfirm={() => void confirm()}
          onReload={() => void reload()}
        />
      )}
    </div>
  );
}

export function GoogleSettings() {
  const { capabilities } = useCurrentUser();
  const allowed = capabilities.includes("integrations.manage");
  const { data, error, refresh } = useResource<GoogleAuthSettings>(
    allowed ? endpoint : null,
  );
  return (
    <>
      <PageHeading
        title="Google sign-in settings"
        description="Configure Google authentication, enable it deliberately and verify it with a real sign-in."
      />
      {!allowed ? (
        <Notice>Your current club role cannot manage integrations.</Notice>
      ) : error ? (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Reload settings
          </button>
        </Notice>
      ) : !data ? (
        <Loading />
      ) : (
        <GoogleSettingsEditor initial={data} />
      )}
    </>
  );
}
