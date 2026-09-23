"use client";

import Link from "next/link";
import { useState } from "react";
import type { AccountWorkspace } from "@/features/members/profile_schemas";
import type { CalendarFeed } from "@/features/calendar/calendar_schemas";
import { dateInZone } from "@/features/calendar/ui/calendar-view";
import type { RegistrationDto } from "@/features/events/registration_schemas";
import { type CurrentUser, useResource } from "./api";
import { Icon } from "./icon";
import { Loading, Notice } from "./primitives";
import { MemberResponses, membershipLabel } from "./member-sections";

function UpcomingActivities({ timezone }: { timezone: string }) {
  const [now] = useState(() => new Date());
  const from = dateInZone(now.toISOString(), timezone);
  const to = new Date(new Date(from + "T12:00:00Z").getTime() + 60 * 86400000)
    .toISOString()
    .slice(0, 10);
  const query = new URLSearchParams({ from, to, timezone });
  const { data, error, refresh } = useResource<CalendarFeed>(
    "/api/calendar?" + query,
  );
  const items = data?.occurrences
    .filter(
      (item) =>
        !item.cancelled && new Date(item.endsAt).getTime() > now.getTime(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 3);
  return (
    <section
      className="member-card member-upcoming"
      aria-label="Upcoming club activities"
    >
      <header className="member-card-heading">
        <div>
          <h2>Coming up</h2>
          <p>Activities you can join in the next 60 days.</p>
        </div>
        <Link className="text-link" href="/membership?tab=calendar">
          Calendar <span aria-hidden="true">→</span>
        </Link>
      </header>
      {error && (
        <Notice>
          Activities could not be loaded.{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {!data && !error && <Loading />}
      {data &&
        !error &&
        (items?.length ? (
          <ul className="member-agenda">
            {items.map((item) => {
              const date = item.allDay
                ? item.date
                : dateInZone(item.startsAt, timezone);
              const day = new Date(date + "T12:00:00Z");
              return (
                <li key={item.id}>
                  <Link href={`/membership?tab=calendar&date=${date}`}>
                    <span className="member-date">
                      <small>
                        {day.toLocaleDateString("en", {
                          month: "short",
                          timeZone: "UTC",
                        })}
                      </small>
                      <strong>{day.getUTCDate()}</strong>
                    </span>
                    <span className="member-agenda-copy">
                      <span className="member-activity-time">
                        {item.allDay
                          ? "All day"
                          : new Date(item.startsAt).toLocaleTimeString("en", {
                              timeZone: timezone,
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                      </span>
                      <strong>{item.title}</strong>
                      <span>
                        {item.location || "Open calendar for details"}
                      </span>
                    </span>
                    <span className="member-row-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="member-empty">
            <Icon name="calendar" />
            <h3>A little space in your calendar</h3>
            <p>
              No upcoming activities in the next 60 days. Check the calendar for
              other dates.
            </p>
            <Link
              className="button button-outline button-small"
              href="/membership?tab=calendar"
            >
              Open calendar
            </Link>
          </div>
        ))}
      {data?.truncated && (
        <p className="field-help">
          This is a selection of upcoming activities. Open Calendar to explore
          by date.
        </p>
      )}
      <div className="member-card-footnote">
        <Icon name="calendar" width={15} height={15} />
        Times shown in {timezone.replaceAll("_", " ")}
      </div>
    </section>
  );
}

function BookingSummary() {
  const { data, error, refresh } = useResource<{
    registrations: RegistrationDto[];
  }>("/api/registrations");
  const items = data?.registrations
    .filter((item) => item.status === "confirmed")
    .slice(0, 2);
  return (
    <section
      className="member-card member-booking-summary"
      aria-label="Your registration summary"
    >
      <header className="member-card-heading">
        <h2>Your bookings</h2>
        <Icon name="calendar" />
      </header>
      {error && (
        <Notice>
          Bookings could not be loaded.{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {!data && !error && <Loading />}
      {data &&
        !error &&
        (items?.length ? (
          <ul className="member-booking-preview" data-private>
            {items.map((item) => (
              <li key={item.id}>
                <strong>{item.eventTitle}</strong>
                <span className="member-pill">Confirmed</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="member-empty-copy">
            No confirmed registrations yet. Find an event you would like to be
            part of.
          </p>
        ))}
      <Link className="member-card-link" href="/membership?tab=bookings">
        Manage bookings <span aria-hidden="true">→</span>
      </Link>
      <Link
        className="member-card-link"
        href="/membership?tab=bookings&view=invitations"
      >
        Event invitations <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

export function MemberHome({
  me,
  account,
  timezone,
  accountError,
}: {
  me: CurrentUser;
  account?: AccountWorkspace;
  timezone: string;
  accountError?: string;
}) {
  return (
    <div className="member-home-grid">
      <div className="member-home-primary">
        {me.features.calendar ? (
          <UpcomingActivities timezone={timezone} />
        ) : (
          <section className="member-card member-empty">
            <Icon name="members" />
            <h2>Stay connected to your club</h2>
            <p>
              Discover what is happening and find your next opportunity to take
              part.
            </p>
            <Link
              className="button button-accent"
              href={me.features.events ? "/events" : "/"}
            >
              {me.features.events ? "Browse events" : "Visit the club website"}
            </Link>
          </section>
        )}
        <MemberResponses account={account} error={accountError} preview />
      </div>
      <aside
        className="member-home-aside"
        aria-label="Your account at a glance"
      >
        <section className="member-card member-account-card">
          <span className="member-account-icon">
            <Icon name="members" width={25} height={25} />
          </span>
          <span className="member-kicker">YOUR MEMBERSHIP</span>
          <h2>{membershipLabel(me.membership?.status)}</h2>
          <p>
            {me.membership?.status === "approved"
              ? "You’re part of the club. Make yourself at home."
              : "Your account and membership details are always here."}
          </p>
          <Link href="/membership?tab=profile" className="member-card-link">
            View my profile <span aria-hidden="true">→</span>
          </Link>
        </section>
        {me.features.events && <BookingSummary />}
        {me.features.calendar && (
          <Link
            className="member-reminder-link"
            href="/membership?tab=calendar&view=subscriptions"
          >
            <Icon name="mail" />
            <span>
              <strong>Stay in the loop</strong>
              <span>Choose your updates & reminders</span>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </aside>
    </div>
  );
}
