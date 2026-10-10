"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PublicOrganization } from "@/core/organization/organization_schemas";
import type { AccountWorkspace } from "@/features/members/profile_schemas";
import { CalendarView } from "@/features/calendar/ui/calendar-view";
import { CalendarSubscriptionsPanel } from "@/features/calendar/ui/calendar-subscriptions";
import { type CurrentUser, useResource } from "./api";
import { Dialog } from "./dialog";
import { Icon, type IconName } from "./icon";
import { Loading, Notice } from "./primitives";
import { SignOutButton } from "./sign-out-button";
import { MemberHome } from "./member-home";
import { MemberProfileEditor } from "./member-profile";
import { MemberBookings, MemberResponses } from "./member-sections";

const sections = {
  home: {
    label: "Home",
    icon: "overview",
    description: "Your activities, bookings and membership, all in one place.",
  },
  calendar: {
    label: "Calendar",
    icon: "calendar",
    description: "Find your next activity and choose how to stay in touch.",
  },
  bookings: {
    label: "My bookings",
    icon: "ticket",
    description: "Your registrations and event invitations, together.",
  },
  responses: {
    label: "My responses",
    icon: "forms",
    description: "Keep track of the forms you have sent to the club.",
  },
  profile: {
    label: "My profile",
    icon: "members",
    description: "Your personal details and club membership.",
  },
} satisfies Record<
  string,
  { label: string; icon: IconName; description: string }
>;
type Section = keyof typeof sections;

export function MemberDashboard({
  me,
  club,
  children,
}: {
  me: CurrentUser;
  club?: PublicOrganization | null;
  children: ReactNode;
}) {
  const query = useSearchParams();
  const requested = query.get("tab") ?? "home";
  const tab: Section = Object.hasOwn(sections, requested)
    ? (requested as Section)
    : "home";
  const [menuOpen, setMenuOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousTab = useRef(tab);
  const { data, error, refresh } =
    useResource<AccountWorkspace>("/api/account");
  const timezone = club?.timezone ?? "UTC";
  const name = data?.profile.displayName || me.actor?.name || "";
  const available = (id: Section) =>
    (id !== "calendar" || me.features.calendar) &&
    (id !== "bookings" || me.features.events);
  useEffect(() => {
    if (previousTab.current !== tab) heading.current?.focus();
    previousTab.current = tab;
  }, [tab]);
  useEffect(() => {
    // Published header/footer links must preserve profile edits too.
    let skipUnload = false;
    let resetUnload: number | undefined;
    function warn(event: BeforeUnloadEvent) {
      if (skipUnload) {
        skipUnload = false;
      } else if (dirty) {
        event.preventDefault();
      }
    }
    function leave(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      const signingOut = target.closest("[data-member-signout] button");
      if (
        !signingOut &&
        (!link ||
          link.target === "_blank" ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0)
      )
        return;
      if (
        !signingOut &&
        link &&
        link.origin === location.origin &&
        link.pathname === location.pathname &&
        link.search === location.search
      ) {
        if (
          link.href === location.href ||
          link.closest(".member-mobile-navigation")
        )
          event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (dirty) {
        if (!window.confirm("Leave without saving your profile?")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        // A native link must not ask again during its default navigation.
        // Expire approval if a client transition or sign-out fails instead.
        skipUnload = true;
        window.clearTimeout(resetUnload);
        resetUnload = window.setTimeout(() => {
          skipUnload = false;
        }, 0);
      }
      setMenuOpen(false);
    }
    document.addEventListener("click", leave, true);
    window.addEventListener("beforeunload", warn);
    return () => {
      document.removeEventListener("click", leave, true);
      window.removeEventListener("beforeunload", warn);
      window.clearTimeout(resetUnload);
    };
  }, [dirty]);
  const navigation = (
    <nav aria-label="Member account" className="member-nav">
      {(Object.keys(sections) as Section[]).filter(available).map((id) => (
        <Link
          key={id}
          href={id === "home" ? "/membership" : `/membership?tab=${id}`}
          aria-current={tab === id ? "page" : undefined}
        >
          <Icon name={sections[id].icon} />
          {sections[id].label}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="member-portal">
      <main id="main-content" className="member-main content-width">
        <div className="member-account-bar">
          <p className="member-kicker">Member space</p>
          <div className="member-account-actions">
            {me.capabilities.length > 0 && (
              <Link className="member-secondary-link" href="/admin">
                <Icon name="controls" width={16} height={16} />
                Open administration
              </Link>
            )}
            <div className="member-signout" data-member-signout>
              <SignOutButton />
            </div>
          </div>
        </div>
        <div className="member-page-heading">
          <div>
            <h1
              ref={heading}
              tabIndex={-1}
              data-private={tab === "home" || undefined}
            >
              {tab === "home"
                ? `Welcome${name ? `, ${name}` : " back"}.`
                : sections[tab].label}
            </h1>
            <p>{sections[tab].description}</p>
          </div>
          {tab === "home" && me.features.events && (
            <Link href="/events" className="button button-accent">
              Explore events <Icon name="external" width={16} height={16} />
            </Link>
          )}
        </div>
        <div className="member-navigation">
          <div className="member-desktop-navigation">{navigation}</div>
          <button
            type="button"
            className="member-menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open member menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
          >
            <Icon name={sections[tab].icon} />
            <span>{sections[tab].label}</span>
            <span className="member-menu-label">
              Menu <Icon name="outline" />
            </span>
          </button>
        </div>
        {error && (
          <Notice>
            {error}{" "}
            <button className="inline-button" onClick={refresh}>
              Try again
            </button>
          </Notice>
        )}
        {!available(tab) ? (
          <section className="member-card member-empty">
            <Icon name="archive" />
            <h2>This area is unavailable</h2>
            <p>
              The club has paused this feature. Your saved records are kept.
            </p>
            <Link className="text-link" href="/membership">
              Back to Home
            </Link>
          </section>
        ) : tab === "home" ? (
          <>
            {me.membership?.status !== "approved" && children}
            <MemberHome
              me={me}
              account={data}
              timezone={timezone}
              accountError={error}
            />
          </>
        ) : tab === "profile" ? (
          <>
            {data ? (
              <MemberProfileEditor
                initial={data}
                onSaved={refresh}
                onDirty={setDirty}
              />
            ) : (
              !error && <Loading />
            )}
            <div className="member-profile-membership">{children}</div>
          </>
        ) : tab === "responses" ? (
          <MemberResponses account={data} error={error} />
        ) : tab === "bookings" ? (
          <MemberBookings />
        ) : (
          <section className="member-card member-calendar">
            <nav className="member-section-tabs" aria-label="Your calendar">
              <Link
                href="/membership?tab=calendar"
                aria-current={
                  query.get("view") !== "subscriptions" ? "page" : undefined
                }
              >
                Activities
              </Link>
              <Link
                href="/membership?tab=calendar&view=subscriptions"
                aria-current={
                  query.get("view") === "subscriptions" ? "page" : undefined
                }
              >
                Email & reminders
              </Link>
            </nav>
            {query.get("view") === "subscriptions" ? (
              <CalendarSubscriptionsPanel />
            ) : (
              <CalendarView
                key={query.get("date") ?? "calendar"}
                timezone={timezone}
                initialDate={query.get("date") ?? undefined}
                subscriptionsHref="/membership?tab=calendar&view=subscriptions"
              />
            )}
          </section>
        )}
      </main>
      {menuOpen && (
        <Dialog title="Member menu" onClose={() => setMenuOpen(false)}>
          <div className="member-mobile-navigation">{navigation}</div>
        </Dialog>
      )}
    </div>
  );
}
