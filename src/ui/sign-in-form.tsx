"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  defaultStaffLogin,
  type StaffLogin,
} from "@/core/organization/club_profile";
import { WorkspaceSignIn, signInContext } from "./workspace-sign-in";
import { AuthShell } from "./auth-shell";
import { authClient } from "@/core/auth/client";
import {
  signInDestination,
  signInErrorCallbackURL,
} from "@/core/auth/sign_in_destination";
import { en } from "@/locales/en";
import { type CurrentUser, errorMessage, useResource } from "./api";
import { Arrow, Loading, Notice } from "./primitives";
import { GoogleSignInButton } from "./google-sign-in-button";
import { SignOutButton } from "./sign-out-button";
import { SetupFrame, SetupHelp, SetupEmailRequired } from "./setup-frame";

function destination() {
  const next = new URLSearchParams(window.location.search).get("next");
  return signInDestination(next);
}

export function SignInForm({
  googleError = false,
  setup = false,
  googleOnly = false,
  appearance = defaultStaffLogin,
  brand,
  hostedDomain = "",
  clubName = "your club",
  returnTo,
  reauth = false,
}: {
  googleError?: boolean;
  setup?: boolean;
  googleOnly?: boolean;
  appearance?: StaffLogin;
  brand?: ReactNode;
  hostedDomain?: string;
  clubName?: string;
  returnTo?: string;
  reauth?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState<"google" | "send" | "verify" | null>(
    null,
  );
  const [failedField, setFailedField] = useState<"email" | "otp">();
  const busy = pending !== null;
  const [error, setError] = useState<string | undefined>(
    googleError
      ? "Google sign-in did not finish. Start again with an allowed Google account."
      : undefined,
  );
  const {
    data: me,
    error: loadError,
    refresh,
  } = useResource<CurrentUser>("/api/me");
  const target = returnTo ?? "/membership";
  const copy = signInContext(target, reauth, appearance);
  const optionsLoading = !setup && !me && !loadError;
  const hasDestinationAccess =
    !target.startsWith("/admin") ||
    Boolean(me?.capabilities.includes("admin.access"));

  function accountPanel(children: ReactNode) {
    return (
      <AuthShell
        brand={brand ?? <Link href="/">{clubName}</Link>}
        context={copy.context}
        introductionHeading={copy.introductionHeading}
        description={copy.description}
        identity={
          me?.actor ? (
            <p>
              Signed in as <strong>{me.actor.email}</strong>
            </p>
          ) : undefined
        }
        footer={
          <Link className="text-link" href="/">
            Back to website <Arrow />
          </Link>
        }
      >
        {children}
      </AuthShell>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    setFailedField(undefined);
    setPending(sent ? "verify" : "send");
    try {
      if (sent) {
        const result = await authClient.signIn.emailOtp({
          email: email.trim(),
          otp,
        });
        if (result.error?.code === "GOOGLE_SIGN_IN_REQUIRED") router.refresh();
        if (result.error)
          throw new Error(
            result.error.message || "The code could not be verified.",
          );
        router.replace(setup ? "/setup" : (returnTo ?? destination()));
        router.refresh();
      } else {
        const result = await authClient.emailOtp.sendVerificationOtp({
          email: email.trim(),
          type: "sign-in",
        });
        if (result.error?.code === "GOOGLE_SIGN_IN_REQUIRED") router.refresh();
        if (result.error)
          throw new Error(
            result.error.message || "The code could not be sent.",
          );
        setSent(true);
      }
    } catch (cause: unknown) {
      setError(errorMessage(cause));
      setFailedField(sent ? "otp" : "email");
    } finally {
      setPending(null);
    }
  }

  async function googleSignIn() {
    if (busy) return;
    setPending("google");
    setError(undefined);
    setFailedField(undefined);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: setup ? "/setup" : (returnTo ?? destination()),
        errorCallbackURL: signInErrorCallbackURL(
          setup ? "/setup" : (returnTo ?? destination()),
          reauth,
        ),
      });
      if (result.error)
        throw new Error(
          result.error.message || "Google sign-in could not start.",
        );
    } catch (cause: unknown) {
      setError(errorMessage(cause));
      setPending(null);
    }
  }

  if (googleOnly)
    return (
      <WorkspaceSignIn
        appearance={appearance}
        brand={brand}
        domain={hostedDomain}
        clubName={clubName}
        returnTo={target}
        reauth={reauth}
        loading={!me && !loadError}
        available={Boolean(me?.googleConfigured)}
        busy={busy}
        error={error}
        loadError={loadError}
        email={me?.actor?.email}
        canContinue={
          !reauth && Boolean(me?.actor) && hasDestinationAccess ? target : false
        }
        onSignIn={() => void googleSignIn()}
        onRetry={refresh}
      />
    );
  if (setup && !me)
    return (
      <SetupFrame step={0}>
        <section className="setup-card">
          <h1>Getting your setup ready.</h1>
          {loadError ? (
            <>
              <Notice>{loadError}</Notice>
              <button className="button button-outline" onClick={refresh}>
                Try again
              </button>
            </>
          ) : (
            <Loading />
          )}
        </section>
      </SetupFrame>
    );
  if (setup && !me?.installed && !me?.setupEmailReady)
    return (
      <SetupFrame step={0}>
        <SetupEmailRequired />
      </SetupFrame>
    );
  if (me?.actor && !reauth && setup)
    return (
      <SetupFrame step={me.installed ? 3 : 2}>
        <section className="setup-card">
          <p className="setup-eyebrow">Email verified</p>
          <h1>You’re ready for the next step.</h1>
          <p className="setup-description">
            Signed in as <strong>{me.actor.email}</strong>.
          </p>
          <Link
            className="button button-accent button-full"
            href={me.installed ? "/admin" : "/setup"}
          >
            Continue setup <Arrow />
          </Link>
          <div className="setup-footnote">
            <SignOutButton />
          </div>
        </section>
      </SetupFrame>
    );
  if (me?.actor && !reauth)
    return accountPanel(
      <section className="auth-card" aria-labelledby="sign-in-title">
        <header className="auth-card-heading">
          <h1 id="sign-in-title">
            {hasDestinationAccess
              ? "You're signed in"
              : "Workspace access needs approval"}
          </h1>
          <p>
            {hasDestinationAccess
              ? "Your account is ready. Continue when you're ready."
              : "You're signed in. Club staff must be approved before opening the workspace."}
          </p>
        </header>
        {!hasDestinationAccess && (
          <Notice kind="info">
            Contact your club owner for staff access. Sign out to use another
            account, or continue to your member account.
          </Notice>
        )}
        <div className="auth-actions">
          <Link
            className="button button-accent button-full"
            href={
              !me.installed
                ? "/setup"
                : hasDestinationAccess
                  ? target
                  : "/membership"
            }
          >
            {hasDestinationAccess ? copy.continueLabel : "Open member account"}{" "}
            <Arrow />
          </Link>
          <SignOutButton />
        </div>
      </section>,
    );
  const combinedError =
    error ||
    (loadError
      ? "Sign-in options could not be loaded. Try again to check the available sign-in methods."
      : undefined);
  const panel = (
    <section
      className={setup ? "panel auth-panel" : "auth-card"}
      aria-labelledby="sign-in-title"
    >
      {setup ? (
        <h2 id="sign-in-title">
          {sent ? "Check your inbox." : "Verify your owner email."}
        </h2>
      ) : (
        <header className="auth-card-heading">
          <h1 id="sign-in-title">{sent ? "Check your inbox" : copy.title}</h1>
          <p>
            {sent
              ? "Enter the six-digit code we sent to your email."
              : me?.googleConfigured
                ? "Choose how you'd like to sign in to your club account."
                : "We’ll email you a code to sign in. No password needed."}
          </p>
        </header>
      )}
      {reauth && me?.actor && (
        <Notice kind="info">
          Confirm your identity to continue with a security change. Use the same
          account: {me.actor.email}.
        </Notice>
      )}
      {combinedError && (
        <div id="sign-in-error">
          <Notice>
            {combinedError}
            {loadError && (
              <div>
                <button
                  type="button"
                  className="inline-button"
                  onClick={refresh}
                >
                  Try again
                </button>
              </div>
            )}
          </Notice>
        </div>
      )}
      {optionsLoading && <Loading />}
      {!sent && me?.googleConfigured && !loadError && (
        <>
          <GoogleSignInButton
            disabled={busy}
            onClick={googleSignIn}
            theme={appearance.buttonTheme}
            shape={appearance.buttonShape}
          >
            {pending === "google" ? "Opening Google…" : "Sign in with Google"}
          </GoogleSignInButton>
          {pending === "google" && (
            <p className="auth-status" role="status">
              Opening Google sign-in…
            </p>
          )}
          <p className="auth-provider-divider">or continue with email</p>
        </>
      )}
      {Boolean(setup || me || sent) && (
        <form
          onSubmit={submit}
          className="form-stack"
          aria-busy={pending === "send" || pending === "verify"}
        >
          {!sent ? (
            <>
              <label>
                {en.auth.email}
                <input
                  type="email"
                  autoComplete="email"
                  name="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (failedField === "email") {
                      setError(undefined);
                      setFailedField(undefined);
                    }
                  }}
                  aria-invalid={failedField === "email" || undefined}
                  aria-describedby={
                    failedField === "email" ? "sign-in-error" : undefined
                  }
                  disabled={busy}
                  maxLength={254}
                  required
                />
              </label>
            </>
          ) : (
            <>
              <p className="muted" id="sign-in-code-help">
                {en.auth.sent} <strong>{email}</strong>
              </p>
              <label>
                {en.auth.code}
                <input
                  className="otp-input"
                  name="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  value={otp}
                  onChange={(event) => {
                    setOtp(event.target.value);
                    if (failedField === "otp") {
                      setError(undefined);
                      setFailedField(undefined);
                    }
                  }}
                  aria-invalid={failedField === "otp" || undefined}
                  aria-describedby={
                    failedField === "otp"
                      ? "sign-in-code-help sign-in-error"
                      : "sign-in-code-help"
                  }
                  disabled={busy}
                  required
                  autoFocus
                />
              </label>
            </>
          )}
          <button
            className="button button-accent button-full"
            type="submit"
            disabled={busy}
          >
            {pending === "verify"
              ? en.auth.verifying
              : pending === "send"
                ? en.auth.sending
                : sent
                  ? en.auth.verify
                  : en.auth.send}
            <Arrow />
          </button>
          {sent && (
            <button
              type="button"
              className="inline-button"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setOtp("");
                setError(undefined);
                setFailedField(undefined);
              }}
            >
              {en.auth.change}
            </button>
          )}
        </form>
      )}
      <p className={setup ? "small muted auth-footnote" : "auth-policy"}>
        {setup
          ? "Use the owner email nominated during setup. After verification, you’ll enter your club details and installation claim."
          : "Signing in verifies your identity. Membership and club access are reviewed separately."}
      </p>
    </section>
  );
  if (setup)
    return (
      <SetupFrame step={1}>
        <div className="setup-card setup-sign-in">
          <p className="setup-eyebrow">Step 02 · Owner access</p>
          <h1>{sent ? "One code. Then you’re in." : "A secure beginning."}</h1>
          <p className="setup-description">
            {sent
              ? "Enter the six-digit code from your verification email to continue."
              : "We’ll send a verification code to your nominated email. No password to remember."}
          </p>
          {panel}
          <SetupHelp />
          <Link className="text-link setup-back" href="/setup">
            Back to setup
          </Link>
        </div>
      </SetupFrame>
    );
  return accountPanel(panel);
}
