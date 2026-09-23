"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
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
import {
  MemberBookings,
  MemberResponses,
  membershipLabel,
} from "./member-sections";

const sections = {
  home: {
    label: "Home",
    icon: "overview",
    description: "A little closer to your club.",
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
  brand,
  children,
}: {
  me: CurrentUser;
  club?: PublicOrganization | null;
  brand?: ReactNode;
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
  const initials =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "M";
  const available = (id: Section) =>
    (id !== "calendar" || me.features.calendar) &&
    (id !== "bookings" || me.features.events);
  useEffect(() => {
    if (previousTab.current !== tab) heading.current?.focus();
    previousTab.current = tab;
  }, [tab]);
  function leave(event: MouseEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a");
    const signingOut = target.closest("[data-member-signout] button");
    if (
      !signingOut &&
      (!link ||
        link.href === location.href ||
        link.target === "_blank" ||
        event.ctrlKey ||
        event.metaKey)
    )
      return;
    if (dirty && !window.confirm("Leave without saving your profile?")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setMenuOpen(false);
  }
  const navigation = (
    <>
      <p className="member-nav-label">Your space</p>
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
      <div className="member-nav-bottom">
        <div className="member-membership-label">
          <span
            className={`member-status-dot is-${me.membership?.status ?? "account"}`}
          />
          {membershipLabel(me.membership?.status)}
        </div>
        <Link className="member-secondary-link member-mobile-website" href="/">
          <Icon name="external" />
          Club website
        </Link>
        {me.capabilities.length > 0 && (
          <Link className="member-secondary-link" href="/admin">
            <Icon name="controls" />
            Open administration
          </Link>
        )}
        <div className="member-signout" data-member-signout>
          <SignOutButton />
        </div>
      </div>
    </>
  );
  return (
    <div className="member-portal" onClickCapture={leave}>
      <header className="member-topbar">
        <div className="member-brand cms-site-part">
          {brand || <Link href="/">{club?.name || "Your club"}</Link>}
        </div>
        <span className="member-portal-label">Member portal</span>
        <div className="member-topbar-actions">
          <Link href="/" className="member-website-link">
            Club website <Icon name="external" width={15} height={15} />
          </Link>
          <Link
            className="member-avatar"
            href="/membership?tab=profile"
            aria-label="Open my profile"
          >
            <span data-private>{initials}</span>
          </Link>
          <button
            className="member-menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open member menu"
            aria-expanded={menuOpen}
          >
            <Icon name="outline" />
          </button>
        </div>
      </header>
      <div className="member-layout">
        <aside className="member-sidebar">{navigation}</aside>
        <main id="main-content" className="member-main">
          <div className="member-page-heading">
            <div>
              <p className="member-kicker">
                {tab === "home" ? "YOUR CLUB, YOUR COMMUNITY" : "MEMBER PORTAL"}
              </p>
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
          <footer className="member-footer">
            {club?.name || "Your club"}
            <span>Your private member space</span>
          </footer>
        </main>
      </div>
      {menuOpen && (
        <Dialog title="Member menu" onClose={() => setMenuOpen(false)}>
          <div className="member-mobile-navigation">{navigation}</div>
        </Dialog>
      )}
    </div>
  );
}
