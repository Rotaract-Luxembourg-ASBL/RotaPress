"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useResource, request, errorMessage, type CurrentUser } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import type {
  CalendarFeed,
  CalendarSubscriptions,
  CalendarSummary,
} from "../calendar_schemas";

function SubscriptionCard({
  calendar,
  saved,
  refresh,
}: {
  calendar: CalendarSummary;
  saved?: CalendarSubscriptions["items"][number];
  refresh: () => void;
}) {
  const [email, setEmail] = useState(saved?.email ?? true);
  const [updates, setUpdates] = useState(saved?.updates ?? true);
  const [reminderMinutes, setReminder] = useState(
    saved?.reminderMinutes ?? 1440,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(active: boolean) {
    setBusy(true);
    setMessage("");
    try {
      await request("/api/calendar/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          calendarId: calendar.id,
          active,
          email,
          updates,
          reminderMinutes,
        }),
      });
      refresh();
      setMessage(
        active
          ? "Preferences saved."
          : "Unsubscribed. New notifications are stopped.",
      );
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="calendar-subscription-card panel"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void save(true);
      }}
    >
      <div className="calendar-row-heading">
        <h3>{calendar.name}</h3>
        <span className="badge">
          {saved?.active
            ? saved.paused
              ? "Notifications paused"
              : "Subscribed"
            : "Not subscribed"}
        </span>
      </div>
      <p>{calendar.description}</p>
      {saved?.active && saved.paused && (
        <p>
          Calendar was disabled by the club. Review your preferences to resume
          notifications.
        </p>
      )}
      <fieldset disabled={busy} className="calendar-fields">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={updates}
            onChange={(e) => setUpdates(e.target.checked)}
          />
          New activities, changes and cancellations
        </label>
        <label>
          Reminder
          <select
            value={reminderMinutes}
            onChange={(e) =>
              setReminder(Number(e.target.value) as 0 | 60 | 1440)
            }
          >
            <option value={0}>No reminders</option>
            <option value={60}>1 hour before</option>
            <option value={1440}>1 day before</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={email}
            onChange={(e) => setEmail(e.target.checked)}
          />
          Email me as well as showing notifications here
        </label>
        <div className="calendar-actions">
          <button className="button button-accent" type="submit">
            {busy
              ? "Saving…"
              : saved?.active
                ? saved.paused
                  ? "Resume notifications"
                  : "Save preferences"
                : "Subscribe"}
          </button>
          {saved?.active && (
            <button
              className="button button-outline"
              type="button"
              onClick={() => void save(false)}
            >
              Unsubscribe
            </button>
          )}
        </div>
      </fieldset>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
export function CalendarSubscriptionsPanel() {
  const { data: me } = useResource<CurrentUser>("/api/me");
  const { data, error, refresh } = useResource<CalendarSubscriptions>(
    me?.actor ? "/api/calendar/subscriptions" : null,
  );
  const [dates] = useState(() => ({
    today: new Date().toISOString().slice(0, 10),
    tomorrow: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  }));
  const { data: available } = useResource<CalendarFeed>(
    me?.actor
      ? "/api/calendar?from=" + dates.today + "&to=" + dates.tomorrow
      : null,
  );
  const [message, setMessage] = useState("");
  if (!me) return <Loading />;
  if (!me.actor)
    return (
      <section className="panel calendar-empty">
        <h2>A calendar that keeps you in the loop</h2>
        <p>
          Sign in with your verified email to choose calendars and notification
          preferences. Public calendars are open to guests; member calendars
          require approved membership.
        </p>
        <Link
          className="button button-accent"
          href="/sign-in?next=/calendar%3Ftab%3Dsubscriptions"
        >
          Sign in to subscribe
        </Link>
      </section>
    );
  async function mark(id: string) {
    try {
      await request("/api/calendar/read", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      refresh();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }
  async function stop(item: CalendarSubscriptions["items"][number]) {
    try {
      await request("/api/calendar/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          calendarId: item.calendarId,
          active: false,
          email: item.email,
          updates: item.updates,
          reminderMinutes: item.reminderMinutes,
        }),
      });
      refresh();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }
  return (
    <section aria-label="Calendar subscriptions">
      <header className="calendar-section-heading">
        <h2>My subscriptions</h2>
        <p>
          Choose what you hear about. You can unsubscribe at any time. Emails
          contain a link to current details, keeping private schedules on this
          website.
        </p>
      </header>
      {(error || message) && <Notice>{error || message}</Notice>}
      {!data && !error && <Loading />}
      <div className="calendar-subscription-grid">
        {data &&
          available?.calendars.map((c) => (
            <SubscriptionCard
              key={c.id}
              calendar={c}
              saved={data.items.find((s) => s.calendarId === c.id)}
              refresh={refresh}
            />
          ))}
      </div>
      {data?.items
        .filter((s) => s.active && !s.available)
        .map((s) => (
          <div className="panel" key={s.calendarId}>
            <p>
              This subscribed calendar is currently unavailable. Notifications
              are paused.
            </p>
            <button
              className="button button-outline"
              onClick={() => void stop(s)}
            >
              Unsubscribe from unavailable calendar
            </button>
          </div>
        ))}
      <section
        className="panel calendar-notifications"
        aria-label="Calendar notifications"
      >
        <h2>Notifications</h2>
        {data?.notifications.length ? (
          <ul>
            {data.notifications.map((n) => (
              <li key={n.id}>
                <div>
                  <strong>{n.name}</strong>
                  <p>
                    {n.kind === "reminder"
                      ? "An activity starts soon. Open the calendar for current details."
                      : "This calendar has updates."}
                  </p>
                  <small>{new Date(n.createdAt).toLocaleString()}</small>
                </div>
                {n.read ? (
                  <span className="badge">Read</span>
                ) : (
                  <button
                    className="button button-outline"
                    onClick={() => void mark(n.id)}
                  >
                    Mark as read
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            You’re all caught up. New updates and reminders will appear here.
          </p>
        )}
      </section>
    </section>
  );
}
