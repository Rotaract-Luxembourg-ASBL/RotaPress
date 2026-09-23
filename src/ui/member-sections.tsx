"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AccountWorkspace } from "@/features/members/profile_schemas";
import { MyRegistrations } from "@/features/events/ui/my-registrations";
import {
  GuestEvent,
  GuestInvitations,
} from "@/features/guests/ui/guest-portal";
import type { MembershipStatus } from "./api";
import { Icon } from "./icon";
import { Loading } from "./primitives";

export function membershipLabel(status?: MembershipStatus) {
  return status
    ? {
        approved: "Active member",
        pending: "Application pending",
        suspended: "Membership paused",
        rejected: "Application not approved",
        former: "Former member",
      }[status]
    : "Personal account";
}

export function MemberResponses({
  account,
  error,
  preview = false,
}: {
  account?: AccountWorkspace;
  error?: string;
  preview?: boolean;
}) {
  const rows = preview ? account?.responses.slice(0, 3) : account?.responses;
  return (
    <section
      className={`member-card${preview ? " member-response-preview" : ""}`}
      aria-label="Your form responses"
    >
      <header className="member-card-heading">
        <div>
          <h2>{preview ? "Recent responses" : "Sent to the club"}</h2>
          <p>Forms sent while signed in to your account.</p>
        </div>
        {preview && (
          <Link href="/membership?tab=responses" className="text-link">
            View all
          </Link>
        )}
      </header>
      {!account && !error && <Loading />}
      {!account && error && (
        <p className="muted">
          Your responses could not be loaded. Try again above.
        </p>
      )}
      {account && !rows?.length && (
        <div className="member-empty">
          <Icon name="forms" />
          <h3>No responses yet</h3>
          <p>
            When you send a form while signed in, you can follow its status
            here.
          </p>
        </div>
      )}
      {rows && rows.length > 0 && (
        <ul className="member-response-list" data-private>
          {rows.map((item) => (
            <li key={item.id}>
              <span className="member-row-icon">
                <Icon name="forms" />
              </span>
              <div>
                <h3>{item.title}</h3>
                <time dateTime={item.receivedAt}>
                  {new Date(item.receivedAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </time>
              </div>
              <span className="member-pill">
                {item.status === "new"
                  ? "Received"
                  : item.status === "reviewing"
                    ? "Under review"
                    : "Closed"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!preview && account?.responses.length === 50 && (
        <p className="field-help">Showing your 50 most recent responses.</p>
      )}
    </section>
  );
}

export function MemberBookings() {
  const query = useSearchParams();
  const eventId = query.get("event");
  const invitation = query.get("invitation");
  if (eventId && invitation)
    return (
      <section className="member-card member-booking-detail">
        <GuestEvent eventId={eventId} id={invitation} embedded />
      </section>
    );
  const invitations = query.get("view") === "invitations";
  return (
    <section className="member-card member-bookings">
      <nav className="member-section-tabs" aria-label="Your bookings">
        <Link
          href="/membership?tab=bookings"
          aria-current={!invitations ? "page" : undefined}
        >
          Registrations
        </Link>
        <Link
          href="/membership?tab=bookings&view=invitations"
          aria-current={invitations ? "page" : undefined}
        >
          Event invitations
        </Link>
      </nav>
      {invitations ? (
        <GuestInvitations embedded />
      ) : (
        <MyRegistrations embedded />
      )}
    </section>
  );
}
