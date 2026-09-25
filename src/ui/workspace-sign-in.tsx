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
      <div className="workspace-sign-in-card">
        <div className="workspace-sign-in-brand">
          {brand}
          <p>{appearance.subtitle}</p>
        </div>
        <h1>{appearance.title}</h1>
        <p>
          {appearance.description ||
            `Sign in with your ${domain ? "managed " : ""}Google account to work with ${clubName}.`}
        </p>
        {error && <Notice>{error}</Notice>}
        {loading ? (
          <Loading />
        ) : canContinue ? (
          <>
            <p>Signed in as {email}.</p>
            <Link className="button button-accent" href={canContinue}>
              Open workspace
            </Link>
            <SignOutButton />
          </>
        ) : (
          <>
            {email && (
              <Notice kind="info">
                This workspace requires a current Google sign-in. Continue with
                the same approved account.
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
          </>
        )}
        <p className="workspace-sign-in-policy">
          {domain ? (
            <>
              For managed <strong>@{domain}</strong> accounts.{" "}
            </>
          ) : (
            "For approved club staff. "
          )}
          New team members need owner approval before accessing the workspace.
        </p>
        <Link className="text-link" href="/">
          Back to website <span aria-hidden="true">→</span>
        </Link>
      </div>
    </main>
  );
}
