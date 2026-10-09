"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { StaffLogin } from "@/core/organization/club_profile";
import { AuthShell } from "./auth-shell";
import { GoogleSignInButton } from "./google-sign-in-button";
import { Arrow, Loading, Notice } from "./primitives";
import { SignOutButton } from "./sign-out-button";

/** Destination affects explanatory copy only; access remains server-authorized. */
export function signInContext(
  returnTo: string,
  reauth: boolean,
  appearance: StaffLogin,
) {
  if (reauth && returnTo === "/admin/integrations/automation/authorize")
    return {
      context: "AI connection",
      introductionHeading: "Your club. Connected.",
      description:
        "Confirm your identity before reviewing the new access requested by your AI app. You choose which actions to allow.",
      title: "Confirm it's you",
      continueLabel: "Review connection access",
    };
  if (reauth)
    return {
      context: "Account security",
      introductionHeading: "Keep your account secure.",
      description:
        "Confirm your identity before continuing with this security change.",
      title: "Confirm it's you",
      continueLabel: "Continue to security settings",
    };
  if (returnTo === "/admin/integrations/automation/authorize")
    return {
      context: "AI connection",
      introductionHeading: "Your club. Connected.",
      description:
        "Sign in to review the access requested by your AI app. You choose which actions to allow.",
      title: "Sign in to connect",
      continueLabel: "Review connection access",
    };
  if (returnTo.startsWith("/admin"))
    return {
      context: appearance.subtitle || "Club workspace",
      introductionHeading: appearance.title,
      description:
        appearance.description ||
        "Manage your club's website, activities, and administration in one place.",
      title: "Sign in to your workspace",
      continueLabel: "Open workspace",
    };
  if (returnTo.startsWith("/calendar"))
    return {
      context: "Club calendar",
      introductionHeading: "Keep your club dates close.",
      description:
        "Sign in to continue to your club calendar and calendar subscriptions.",
      title: "Sign in to your calendar",
      continueLabel: "Continue to calendar",
    };
  if (returnTo === "/membership")
    return {
      context: "Member access",
      introductionHeading: "Stay connected to your club.",
      description:
        "Access your membership and take part in club activities with your own account.",
      title: "Sign in to your club account",
      continueLabel: "Continue to membership",
    };
  return {
    context: "Your club account",
    introductionHeading: "Take part in club life.",
    description:
      "Sign in to continue with your club activity using your own account.",
    title: "Sign in to continue",
    continueLabel: "Continue to your account",
  };
}

export function WorkspaceSignIn({
  appearance,
  brand,
  domain,
  clubName,
  returnTo,
  reauth,
  loading,
  available,
  busy,
  error,
  loadError,
  email,
  canContinue,
  onSignIn,
  onRetry,
}: {
  appearance: StaffLogin;
  brand?: ReactNode;
  domain: string;
  clubName: string;
  returnTo: string;
  reauth: boolean;
  loading: boolean;
  available: boolean;
  busy: boolean;
  error?: string;
  loadError?: string;
  email?: string;
  canContinue: string | false;
  onSignIn: () => void;
  onRetry: () => void;
}) {
  const copy = signInContext(returnTo, reauth, appearance);
  const staffDestination = returnTo.startsWith("/admin");
  const unavailable = !loading && !loadError && !available && !canContinue;
  const notice =
    error ||
    (loadError
      ? "Sign-in options could not be loaded. Try again to check the available sign-in method."
      : unavailable
        ? "Google sign-in is currently unavailable. Try again or contact your club owner."
        : undefined);

  return (
    <AuthShell
      brand={brand ?? <Link href="/">{clubName}</Link>}
      context={copy.context}
      introductionHeading={copy.introductionHeading}
      description={copy.description}
      identity={
        email ? (
          <p>
            Signed in as <strong>{email}</strong>
          </p>
        ) : undefined
      }
      footer={
        <Link className="text-link" href="/">
          Back to website <Arrow />
        </Link>
      }
    >
      <section
        className="auth-card"
        aria-labelledby="google-sign-in-title"
        aria-busy={busy || loading}
      >
        <header className="auth-card-heading">
          <h1 id="google-sign-in-title">
            {canContinue ? "You're signed in" : copy.title}
          </h1>
          <p>
            {canContinue
              ? "Your account is ready. Continue when you're ready."
              : `Use your ${domain ? "managed " : ""}Google account to sign in to ${clubName}.`}
          </p>
        </header>
        {notice && (
          <Notice>
            {notice}
            {(loadError || unavailable) && (
              <div>
                <button
                  type="button"
                  className="inline-button"
                  onClick={onRetry}
                >
                  Try again
                </button>
              </div>
            )}
          </Notice>
        )}
        {loading ? (
          <Loading />
        ) : canContinue ? (
          <div className="auth-actions">
            <Link
              className="button button-accent button-full"
              href={canContinue}
            >
              {copy.continueLabel} <Arrow />
            </Link>
            <SignOutButton />
          </div>
        ) : (
          <>
            {email && (
              <Notice kind="info">
                {staffDestination && !reauth
                  ? "Workspace access needs staff approval. Try another Google account or contact your club owner."
                  : "Confirm your identity by signing in with the same Google account."}
              </Notice>
            )}
            {available && !loadError && (
              <GoogleSignInButton
                onClick={onSignIn}
                disabled={busy}
                theme={appearance.buttonTheme}
                shape={appearance.buttonShape}
              >
                {busy ? "Opening Google…" : "Sign in with Google"}
              </GoogleSignInButton>
            )}
            {busy && (
              <p className="auth-status" role="status">
                Opening Google sign-in…
              </p>
            )}
            {email && <SignOutButton />}
          </>
        )}
        <p className="auth-policy">
          {domain && (
            <>
              Use a managed <strong>@{domain}</strong> account.{" "}
            </>
          )}
          {staffDestination
            ? "Workspace access is for approved club staff. New team members need owner approval."
            : "Signing in verifies your identity. Membership and club access are reviewed separately."}
        </p>
      </section>
    </AuthShell>
  );
}
