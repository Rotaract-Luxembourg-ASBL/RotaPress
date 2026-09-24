"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/core/auth/client";
import { signInDestination } from "@/core/auth/sign_in_destination";
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
}: {
  googleError?: boolean;
  setup?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(
    googleError
      ? "Google sign-in did not finish. Start again or use email verification."
      : undefined,
  );
  const {
    data: me,
    error: loadError,
    refresh,
  } = useResource<CurrentUser>("/api/me");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      if (sent) {
        const result = await authClient.signIn.emailOtp({
          email: email.trim(),
          otp,
        });
        if (result.error)
          throw new Error(
            result.error.message || "The code could not be verified.",
          );
        router.replace(setup ? "/setup" : destination());
        router.refresh();
      } else {
        const result = await authClient.emailOtp.sendVerificationOtp({
          email: email.trim(),
          type: "sign-in",
        });
        if (result.error)
          throw new Error(
            result.error.message || "The code could not be sent.",
          );
        setSent(true);
      }
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: setup ? "/setup" : destination(),
      });
      if (result.error)
        throw new Error(
          result.error.message || "Google sign-in could not start.",
        );
    } catch (cause: unknown) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  const reauth =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("reauth") === "1";
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
    return (
      <main id="main-content" className="auth-layout">
        <div className="auth-introduction">
          <p className="eyebrow">Welcome back</p>
          <h1>Your community awaits.</h1>
          <p>
            Your membership, profile and activities are ready in your member
            space.
          </p>
        </div>
        <section className="panel auth-panel signed-in-actions">
          <p className="eyebrow">Signed in</p>
          <h2>You’re all set.</h2>
          <p>{me.actor.email}</p>
          <Link
            className="button button-accent"
            href={me.installed ? destination() : "/setup"}
          >
            Continue to your account <Arrow />
          </Link>
          <SignOutButton />
        </section>
      </main>
    );
  const panel = (
    <section className="panel auth-panel" aria-labelledby="sign-in-title">
      <p className="eyebrow">Your account</p>
      <h2 id="sign-in-title">
        {sent
          ? "Check your inbox."
          : setup
            ? "Verify your owner email."
            : "Sign in."}
      </h2>
      {reauth && me?.actor && (
        <Notice kind="info">
          Confirm your identity to continue with a security change. Use the same
          account: {me.actor.email}.
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {!sent && me?.googleConfigured && (
        <>
          <GoogleSignInButton disabled={busy} onClick={googleSignIn} />
          <p className="auth-provider-divider">or continue with email</p>
        </>
      )}
      <form onSubmit={submit} className="form-stack">
        {!sent ? (
          <>
            <label>
              {en.auth.email}
              <input
                type="email"
                autoComplete="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                required
              />
            </label>
          </>
        ) : (
          <>
            <p className="muted">
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
                onChange={(event) => setOtp(event.target.value)}
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
          {busy
            ? sent
              ? en.auth.verifying
              : en.auth.sending
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
            }}
          >
            {en.auth.change}
          </button>
        )}
      </form>
      <p className="small muted auth-footnote">
        {setup
          ? "Use the owner email nominated during setup. After verification, you’ll enter your club details and installation claim."
          : "Your email verifies your identity. Club access is granted after a membership review."}
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
  return (
    <main id="main-content" className="auth-layout">
      <div className="auth-introduction">
        <p className="eyebrow">{en.auth.eyebrow}</p>
        <h1>{en.auth.title}</h1>
        <p>
          {me?.googleConfigured
            ? "Continue with your Google account or use an email verification code."
            : en.auth.description}
        </p>
        <div className="auth-flower" aria-hidden="true">
          ✳
        </div>
      </div>
      {panel}
    </main>
  );
}
