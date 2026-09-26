"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { StaffLogin } from "@/core/organization/club_profile";
import { GoogleSignInButton } from "./google-sign-in-button";
import { Loading, Notice } from "./primitives";
import { SignOutButton } from "./sign-out-button";

export function WorkspaceSignIn({
  appearance,
  brand,
  domain,
  clubName,
  staffDestination,
  reauth,
  loading,
  available,
  busy,
  error,
  email,
  canContinue,
  onSignIn,
  onRetry,
}: {
  appearance: StaffLogin;
  brand?: ReactNode;
  domain: string;
  clubName: string;
  staffDestination: boolean;
  reauth: boolean;
  loading: boolean;
  available: boolean;
  busy: boolean;
  error?: string;
  email?: string;
  canContinue: string | false;
  onSignIn: () => void;
  onRetry: () => void;
}) {
  return (
    <main id="main-content" className="workspace-sign-in">
      <section
        className="workspace-sign-in-card"
        aria-labelledby="google-sign-in-title"
        aria-busy={busy || loading}
      >
        <div className="workspace-sign-in-brand">
          {brand}
          <p>{appearance.subtitle}</p>
        </div>
        <h1 id="google-sign-in-title">{appearance.title}</h1>
        <p>
          {appearance.description ||
            `Use your ${domain ? "managed " : ""}Google account to sign in to ${clubName}.`}
        </p>
        {error && <Notice>{error}</Notice>}
        {loading ? (
          <Loading />
        ) : canContinue ? (
          <>
            <p>Signed in as {email}.</p>
            <Link className="button button-accent" href={canContinue}>
              {staffDestination ? "Open workspace" : "Continue to your account"}
            </Link>
            <SignOutButton />
          </>
        ) : (
          <>
            {email && (
              <Notice kind="info">
                {staffDestination && !reauth
                  ? "Workspace access needs staff approval. You can try another Google account or contact your club owner."
                  : "Confirm your identity by signing in with the same Google account."}
              </Notice>
            )}
            {available ? (
              <GoogleSignInButton
                onClick={onSignIn}
                disabled={busy}
                theme={appearance.buttonTheme}
                shape={appearance.buttonShape}
              />
            ) : (
              <Notice>
                Google sign-in is currently unavailable. Contact your club
                owner.{" "}
                <button className="inline-button" onClick={onRetry}>
                  Try again
                </button>
              </Notice>
            )}
            {busy && <p role="status">Opening Google sign-in…</p>}
            {email && <SignOutButton />}
          </>
        )}
        <p className="workspace-sign-in-policy">
          {domain ? (
            <>
              For managed <strong>@{domain}</strong> accounts.{" "}
            </>
          ) : null}
          {staffDestination
            ? "Workspace access is for approved club staff. New team members need owner approval."
            : "Signing in verifies your identity. Membership and club access are reviewed separately."}
        </p>
        <Link className="text-link" href="/">
          Back to website <span aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}
