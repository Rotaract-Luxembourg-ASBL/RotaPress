"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useResource, request, errorMessage } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import type { GuestInvitation, GuestPortal } from "../guest_schemas";
import { GuestPurchases } from "./guest-purchases";
import { useCollectionLocation } from "@/ui/collection-location";
import { CollectionPagination } from "@/ui/collection-pagination";
import type { CollectionPage } from "@/core/collections";
import { useCollectionReturn } from "@/ui/collection-return";

function when(date: string, timezone: string) {
  return new Date(date).toLocaleString("en-GB", {
    timeZone: timezone,
    dateStyle: "long",
    timeStyle: "short",
  });
}
export function GuestInvitations({ embedded = false }: { embedded?: boolean }) {
  const { params, change } = useCollectionLocation();
  const page = Number(params.get("invitationsPage")) || 1;
  const search = params.get("invitationsSearch") ?? "";
  const returnTo = embedded ? `/membership?${params}` : `/guest?${params}`;
  const { data, error, refresh } = useResource<
    CollectionPage & {
      invitations: GuestInvitation[];
    }
  >(`/api/guest?${new URLSearchParams({ page: String(page), search })}`);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const destination = (row: GuestInvitation) =>
    embedded
      ? `/membership?tab=bookings&event=${row.eventId}&invitation=${row.id}&returnTo=${encodeURIComponent(returnTo)}`
      : `/guest/${row.eventId}/${row.id}?returnTo=${encodeURIComponent(returnTo)}`;
  async function claim(row: GuestInvitation) {
    setBusy(true);
    setProblem(undefined);
    try {
      await request(`/api/guest/${row.eventId}/${row.id}/claim`, {
        method: "POST",
        body: JSON.stringify({ confirmed: true }),
      });
      router.push(destination(row));
    } catch (cause) {
      setProblem(errorMessage(cause));
      setBusy(false);
    }
  }
  return (
    <>
      {!embedded && <p className="eyebrow">Your event space</p>}
      {embedded ? <h2>Event invitations</h2> : <h1>Guest portal</h1>}
      <p className="muted">
        Your invitations, event details and booking status in one private place.
      </p>
      <label>
        Find an invitation
        <input
          type="search"
          value={search}
          onChange={(event) =>
            change(
              { invitationsSearch: event.target.value, invitationsPage: 1 },
              false,
            )
          }
        />
      </label>
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>{" "}
          <Link href={`/sign-in?next=${encodeURIComponent(returnTo)}`}>
            Sign in
          </Link>
        </Notice>
      )}
      {problem && <Notice>{problem}</Notice>}
      {!data && !error && <Loading />}
      {data && !error && (
        <>
          <p>
            Accept an invitation from the event team to open your booking
            details.
          </p>
          {!data.invitations.length && (
            <Notice kind="info">
              No available invitations for this account. Sign in with the
              invited email address, or contact the event team.
            </Notice>
          )}
          <ul className="content-rows">
            {data.invitations.map((row) => (
              <li className="content-row" key={row.id}>
                <div>
                  <strong>{row.title}</strong>
                  <p>{when(row.startsAt, row.timezone)}</p>
                  <span className="small muted">
                    {row.timezone} ·{" "}
                    {row.claimed ? "Invitation accepted" : "You are invited"}
                  </span>
                </div>
                {row.claimed ? (
                  <Link
                    className="button button-accent"
                    href={destination(row)}
                  >
                    Open event space
                  </Link>
                ) : (
                  <button
                    className="button button-accent"
                    disabled={busy}
                    onClick={() => void claim(row)}
                  >
                    Accept invitation
                  </button>
                )}
              </li>
            ))}
          </ul>
          <CollectionPagination
            {...data}
            noun="invitations"
            onPage={(next) => change({ invitationsPage: next }, false)}
          />
        </>
      )}
      {!embedded && (
        <div className="form-actions">
          <Link href="/registrations" className="button button-outline">
            My registrations
          </Link>
          <Link href="/events" className="text-link">
            Browse events
          </Link>
        </div>
      )}
    </>
  );
}
export function GuestEvent({
  eventId,
  id,
  embedded = false,
}: {
  eventId: string;
  id: string;
  embedded?: boolean;
}) {
  const returnTo = useCollectionReturn(embedded ? "/membership" : "/guest");
  const { params } = useCollectionLocation();
  const { data, error } = useResource<GuestPortal>(
    `/api/guest/${encodeURIComponent(eventId)}/${encodeURIComponent(id)}`,
  );
  return (
    <>
      <Link
        href={
          returnTo === "/membership"
            ? "/membership?tab=bookings&view=invitations"
            : returnTo
        }
        className="text-link"
      >
        All my invitations
      </Link>
      {error && (
        <Notice>
          {error}{" "}
          <Link
            href={`/sign-in?next=${encodeURIComponent(embedded ? `/membership?${params}` : `/guest/${eventId}/${id}?${params}`)}`}
          >
            Sign in
          </Link>
        </Notice>
      )}
      {!data && !error && <Loading />}
      {data && !error && (
        <>
          <p className="eyebrow">Your private event space</p>
          {embedded ? <h2>{data.event.title}</h2> : <h1>{data.event.title}</h1>}
          <p>{data.event.description}</p>
          <dl className="guest-facts">
            <div>
              <dt>When</dt>
              <dd>
                {when(data.event.startsAt, data.event.timezone)}
                {data.event.endsAt && (
                  <> — {when(data.event.endsAt, data.event.timezone)}</>
                )}
                <br />
                <span className="muted">{data.event.timezone}</span>
              </dd>
            </div>
            {data.event.venue && (
              <div>
                <dt>Where</dt>
                <dd>{data.event.venue}</dd>
              </div>
            )}
          </dl>
          <section className="guest-booking" aria-label="Your booking">
            <p className="eyebrow">Your booking</p>
            <h2>{data.booking.status.replaceAll("_", " ")}</h2>
            {data.booking.source === "native" ? (
              <>
                <p>Your free registration is managed by this club.</p>
                <Link
                  href={
                    embedded ? "/membership?tab=bookings" : "/registrations"
                  }
                  className="button button-outline"
                >
                  Manage my registration
                </Link>
              </>
            ) : (
              <>
                <p>
                  Status from the last Luma reconciliation. This is not proof of
                  payment or prize eligibility.
                </p>
                {data.booking.observedAt && (
                  <p className="small muted">
                    Last observed{" "}
                    {new Date(data.booking.observedAt).toLocaleString("en-GB")}
                  </p>
                )}
              </>
            )}
          </section>
          {data.booking.source === "luma" && (
            <GuestPurchases eventId={eventId} grantId={id} />
          )}
          <p className="small muted">
            This space shows only your booking and published event details.
            Contact the event team for help with your invitation.
          </p>
        </>
      )}
    </>
  );
}
