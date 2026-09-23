"use client";
import { useSearchParams } from "next/navigation";
import type { CalendarPageDefinition } from "../calendar_schemas";
import { CalendarView } from "./calendar-view";
import { CalendarSubscriptionsPanel } from "./calendar-subscriptions";
export function CalendarPublic({ design }: { design: CalendarPageDefinition }) {
  const query = useSearchParams();
  const subscriptions = query.get("tab") === "subscriptions";
  function change(tab: string) {
    const url = new URL(location.href);
    url.searchParams.set("tab", tab);
    history.replaceState(null, "", url);
  }
  return (
    <div className="calendar-public">
      <header className="calendar-public-heading">
        <p className="eyebrow">Together, in time</p>
        <h1>{design.title}</h1>
        <p>{design.introduction}</p>
      </header>
      <nav className="calendar-tabs" aria-label="Calendar workspace">
        <button
          aria-current={!subscriptions ? "page" : undefined}
          onClick={() => change("calendar")}
        >
          Explore calendar
        </button>
        <button
          aria-current={subscriptions ? "page" : undefined}
          onClick={() => change("subscriptions")}
        >
          My subscriptions
        </button>
      </nav>
      {subscriptions ? (
        <CalendarSubscriptionsPanel />
      ) : (
        <CalendarView
          calendarIds={design.calendarIds}
          initialView={design.view}
          timezone={design.timezone}
        />
      )}
    </div>
  );
}
