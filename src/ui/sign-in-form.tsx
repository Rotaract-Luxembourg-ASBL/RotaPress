"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/core/auth/client";
import { signInDestination } from "@/core/auth/sign_in_destination";
import { en } from "@/locales/en";
import { type CurrentUser, errorMessage, useResource } from "./api";
import { Arrow, Notice } from "./primitives";
import { GoogleSignInButton } from "./google-sign-in-button";
import { SignOutButton } from "./sign-out-button";

function destination() {
  const next = new URLSearchParams(window.location.search).get("next");
  return signInDestination(next);
}

export function SignInForm({ googleError = false }: { googleError?: boolean }) {
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
  const { data: me } = useResource<CurrentUser>("/api/me");

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
        router.replace(destination());
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
        callbackURL: destination(),
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
      <section className="panel auth-panel" aria-labelledby="sign-in-title">
        <p className="eyebrow">Your account</p>
        <h2 id="sign-in-title">{sent ? "Check your inbox." : "Sign in."}</h2>
        {reauth && me?.actor && (
          <Notice kind="info">
            Confirm your identity to continue with a security change. Use the
            same account: {me.actor.email}.
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
          Your email verifies your identity. Club access is granted after a
          membership review.
        </p>
      </section>
    </main>
  );
}
