"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

export function MembershipPage({ club }: { club?: PublicOrganization | null }) {
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
          <h2>Welcome to your club account.</h2>
          <p>
            Sign in to find your activities, bookings and personal details, or
            apply to join. The club reviews each membership application.
          </p>
          <Link
            href="/sign-in?next=/membership"
            className="button button-accent"
          >
            Sign in to continue <Arrow />
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
      <MemberDashboard me={me} club={club}>
        {panel}
      </MemberDashboard>
    );
  if (!me)
    return (
      <main id="main-content" className="member-loading content-width">
        <p className="eyebrow">Member space</p>
        <h1>Your club account</h1>
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
    );
  return (
    <main id="main-content" className="membership-layout content-width">
      <div className="membership-intro">
        <p className="eyebrow">Member space</p>
        <h1>Your club, closer.</h1>
        <p>
          A place to stay connected with {club?.name || "your community"}, take
          part and keep your details up to date.
        </p>
        <ul className="membership-benefits">
          <li>Find club activities and your event bookings.</li>
          <li>Follow your membership application.</li>
          <li>Keep your profile and form responses together.</li>
        </ul>
      </div>
      {panel}
    </main>
  );
}
