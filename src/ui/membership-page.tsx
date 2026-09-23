"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { PublicOrganization } from "@/core/organization/organization_schemas";
import type { PublicFormDto } from "@/features/forms/form_types";
import { PublicFormContent } from "@/features/forms/ui/public-form";
import {
  type CurrentUser,
  type MembershipStatus,
  errorMessage,
  request,
  useResource,
} from "./api";
import { Arrow, Loading, Notice } from "./primitives";
import { MemberDashboard } from "./member-dashboard";
import { SignOutButton } from "./sign-out-button";

const membershipCopy: Record<
  MembershipStatus,
  { title: string; description: string }
> = {
  pending: {
    title: "Your application is with the club.",
    description:
      "Your membership is pending review. The club will decide whether to approve your application. You can check its status here.",
  },
  approved: {
    title: "You’re part of the club.",
    description: "Your membership has been approved. Welcome to the community.",
  },
  suspended: {
    title: "Your membership is suspended.",
    description:
      "Club permissions are currently paused. Contact your club’s administrators if you need help with your membership.",
  },
  rejected: {
    title: "Your application was not approved.",
    description:
      "Contact your club’s administrators if you have questions about the decision.",
  },
  former: {
    title: "Your membership has ended.",
    description:
      "Your account is still available, but club permissions are no longer active. Contact the club if you would like to return.",
  },
};

export function MembershipPage({
  club,
  brand,
}: {
  club?: PublicOrganization | null;
  brand?: ReactNode;
}) {
  const {
    data: me,
    error: loadError,
    refresh,
  } = useResource<CurrentUser>("/api/me");
  const {
    data: applicationForm,
    error: formError,
    refresh: refreshForm,
  } = useResource<{ form: PublicFormDto | null }>(
    me?.actor &&
      (!me.membership || ["rejected", "former"].includes(me.membership.status))
      ? "/api/membership/form"
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  async function apply() {
    if (!applicationForm || applicationForm.form || formError) return;
    setBusy(true);
    setError(undefined);
    try {
      await request("/api/membership", { method: "POST", body: "{}" });
      refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const copy = me?.membership ? membershipCopy[me.membership.status] : null;
  const canApply =
    !me?.membership ||
    me.membership.status === "rejected" ||
    me.membership.status === "former";
  const panel = (
    <section className="panel membership-panel" aria-label="Your membership">
      {loadError ? (
        <Notice>
          {loadError}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      ) : !me ? (
        <Loading />
      ) : !me.installed ? (
        <>
          <h2>The club is taking shape.</h2>
          <p>
            Membership applications will open after the owner finishes setting
            up this installation.
          </p>
          <Link href="/setup" className="text-link">
            Owner setup <Arrow />
          </Link>
        </>
      ) : !me.actor ? (
        <>
          <h2>A warm welcome starts here.</h2>
          <p>
            Verify your email, then send a membership request to the club. Your
            club reviews each application.
          </p>
          <Link
            href="/sign-in?next=/membership"
            className="button button-accent"
          >
            Sign in to apply <Arrow />
          </Link>
        </>
      ) : (
        <>
          <p className="eyebrow">Your membership</p>
          {me.membership && (
            <span className={`status-badge status-${me.membership.status}`}>
              {me.membership.status}
            </span>
          )}
          <h2>{copy?.title || "Ready to be part of it?"}</h2>
          <p>
            {copy?.description ||
              "Apply with your verified account. Your name and email will be shared with the club’s membership reviewers."}
          </p>
          {error && <Notice>{error}</Notice>}
          {canApply &&
            (formError ? (
              <Notice>
                {formError}{" "}
                <button
                  type="button"
                  className="inline-button"
                  onClick={refreshForm}
                >
                  Try loading the application again
                </button>
              </Notice>
            ) : !applicationForm ? (
              <Loading />
            ) : applicationForm.form ? (
              <PublicFormContent
                key={applicationForm.form.versionId}
                form={applicationForm.form}
                onSubmitted={refresh}
              />
            ) : (
              <button
                type="button"
                className="button button-accent"
                onClick={apply}
                disabled={busy}
              >
                {busy ? "Sending application…" : "Apply for membership"}
                <Arrow />
              </button>
            ))}
          {me.membership && (
            <button
              type="button"
              className="text-link member-check-status"
              onClick={refresh}
            >
              Refresh membership status
            </button>
          )}
          <div className="membership-account">
            <SignOutButton />
          </div>
        </>
      )}
    </section>
  );
  if (me?.actor && me.installed)
    return (
      <MemberDashboard me={me} club={club} brand={brand}>
        {panel}
      </MemberDashboard>
    );
  if (brand && !me)
    return (
      <div className="member-portal">
        <header className="member-topbar">
          <div className="member-brand cms-site-part">{brand}</div>
          <span className="member-portal-label">Member portal</span>
        </header>
        <main id="main-content" className="member-main">
          {loadError ? (
            <Notice>
              {loadError}{" "}
              <button className="inline-button" onClick={refresh}>
                Try again
              </button>
            </Notice>
          ) : (
            <Loading />
          )}
        </main>
      </div>
    );
  return (
    <main id="main-content" className="membership-layout content-width">
      <div className="membership-intro">
        <p className="eyebrow">Your place in the community</p>
        <h1>Join your community.</h1>
        <p>Sign in, apply for membership and keep up with your club.</p>
      </div>
      {panel}
    </main>
  );
}
