"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { en } from "@/locales/en";
import { type CurrentUser, useResource } from "./api";
import { Icon, type IconName } from "./icon";
import { Arrow, Brand, Loading, Notice } from "./primitives";
import { AdminAccountMenu } from "./admin-account-menu";
import { Dialog } from "./dialog";
import {
  featureCatalogue,
  type FeatureKey,
} from "@/core/features/feature_catalogue";

const UserContext = createContext<CurrentUser | null>(null);

export function useCurrentUser() {
  const currentUser = useContext(UserContext);
  if (!currentUser)
    throw new Error("The administration context is unavailable.");
  return currentUser;
}

export function AdminShell({
  children,
  brand,
}: {
  children: ReactNode;
  brand: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me, error, refresh } = useResource<CurrentUser>("/api/me");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    window.addEventListener("club-features-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("club-features-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  useEffect(() => {
    const refreshIdentity = () => router.refresh();
    window.addEventListener("club-settings-updated", refreshIdentity);
    window.addEventListener("website-published", refreshIdentity);
    return () => {
      window.removeEventListener("club-settings-updated", refreshIdentity);
      window.removeEventListener("website-published", refreshIdentity);
    };
  }, [router]);
  if (error)
    return (
      <main id="main-content" className="content-width standalone-state">
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      </main>
    );
  if (!me)
    return (
      <main id="main-content">
        <Loading />
      </main>
    );
  if (!me.actor || me.capabilities.length === 0)
    return (
      <main id="main-content" className="content-width standalone-state">
        <Brand />
        <section className="panel empty-state">
          <h1>{en.admin.accessTitle}</h1>
          <p>{en.admin.accessDescription}</p>
          <Link
            href={me.actor ? "/membership" : "/sign-in?next=/admin"}
            className="button button-accent"
          >
            {me.actor ? "View membership" : "Sign in"}
            <Arrow />
          </Link>
        </section>
      </main>
    );

  const links = [
    {
      href: "/admin",
      label: en.admin.overview,
      icon: "overview",
      visible: true,
    },
    {
      href: "/admin/website",
      label: "Website",
      icon: "website",
      visible: me.capabilities.includes("cms.edit"),
    },
    {
      href: "/admin/media",
      label: "Media",
      icon: "image",
      visible: me.capabilities.includes("media.manage"),
    },
    {
      href: "/admin/events",
      label: "Events",
      icon: "calendar",
      visible: me.capabilities.includes("events.access"),
    },
    {
      href: "/admin/projects",
      label: "Projects",
      icon: "outline",
      visible: me.capabilities.includes("cms.edit"),
    },
    {
      href: "/admin/forms",
      label: "Forms",
      icon: "forms",
      visible: me.capabilities.includes("forms.edit"),
    },
    {
      href: "/admin/calendar",
      label: "Calendar",
      icon: "calendar",
      visible: me.capabilities.includes("calendar.manage"),
    },
    {
      href: "/admin/partners",
      label: "Community directory",
      icon: "members",
      visible: me.capabilities.includes("cms.edit"),
    },
    {
      href: "/admin/inbox",
      label: "Response center",
      icon: "members",
      visible:
        me.features.forms &&
        (me.capabilities.includes("submissions.read") ||
          me.capabilities.includes("events.responses.access")),
    },
    {
      href: "/admin/members",
      label: en.admin.members,
      icon: "members",
      visible:
        me.capabilities.includes("members.review") ||
        me.capabilities.includes("members.manage"),
    },
    {
      href: "/admin/integrations",
      label: "Integrations",
      icon: "settings",
      visible: me.capabilities.includes("integrations.manage"),
    },
    {
      href: "/admin/settings",
      label: en.admin.settings,
      icon: "controls",
      visible: me.capabilities.includes("settings.manage"),
    },
  ].filter((link) => link.visible);
  const active = (href: string) =>
    pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));

  // The editor keeps the authenticated context while owning the entire viewport.
  // Server layout and feature services still enforce the same access boundaries.
  if (
    /^\/admin\/website\/[0-9a-f-]{36}(\/preview)?\/?$/.test(pathname) ||
    /^\/admin\/website\/kits\/[^/]+\/preview/.test(pathname) ||
    pathname === "/admin/website/preview"
  ) {
    return (
      <UserContext.Provider value={me}>
        {pathname.endsWith("/preview") ? (
          <div className="admin-preview-root">{children}</div>
        ) : (
          <main id="main-content" className="admin-editor-root">
            {children}
          </main>
        )}
      </UserContext.Provider>
    );
  }

  const unavailable = (
    ["forms", "events", "calendar", "projects"] as FeatureKey[]
  ).find(
    (key) =>
      !me.features[key] &&
      (pathname === `/admin/${key}` || pathname.startsWith(`/admin/${key}/`)),
  );
  if (/^\/admin\/events\/[0-9a-f-]{36}(\/|$)/.test(pathname)) {
    return (
      <UserContext.Provider value={me}>
        {unavailable ? (
          <main id="main-content" className="content-width standalone-state">
            <section className="panel empty-state">
              <h1>Events is disabled</h1>
              <p>
                Saved content and history are kept. An administrator can enable
                Events in Integrations.
              </p>
              <Link href="/admin/events" className="button button-outline">
                Back to events
              </Link>
            </section>
          </main>
        ) : (
          children
        )}
      </UserContext.Provider>
    );
  }
  const navigation = (
    <>
      <p className="admin-nav-label">Workspace</p>
      <nav className="admin-navigation" aria-label="Administration">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={active(link.href) ? "active" : ""}
            aria-current={active(link.href) ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            <Icon name={link.icon as IconName} />
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <Link href="/membership" className="text-link">
          <Icon name="members" /> Member portal
        </Link>
        <span className="small muted">Powered by RotaPress</span>
      </div>
    </>
  );
  return (
    <UserContext.Provider value={me}>
      <div className="admin-layout">
        <header className="admin-topbar">
          <button
            className="admin-menu-toggle"
            aria-label="Open administration menu"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="outline" />
          </button>
          <div className="admin-brand cms-site-part">
            {brand || <Link href="/">Your club</Link>}
          </div>
          <span className="admin-space-label">
            {me.capabilities.includes("admin.access")
              ? "Administration"
              : "Event team"}
          </span>
          <div className="admin-header-actions">
            <Link href="/" className="admin-website-link">
              Club website <Icon name="external" width={15} height={15} />
            </Link>
            <AdminAccountMenu me={me} />
          </div>
        </header>
        <aside className="admin-sidebar">{navigation}</aside>
        <div className="admin-main">
          <main id="main-content" className="admin-content">
            {unavailable ? (
              <section className="panel empty-state">
                <h1>{featureCatalogue[unavailable].name} is disabled</h1>
                <p>
                  Saved content and history are kept. An administrator can
                  enable this feature in Integrations.
                </p>
                {me.capabilities.includes("integrations.manage") && (
                  <Link
                    href="/admin/integrations"
                    className="button button-accent"
                  >
                    Manage features
                  </Link>
                )}
              </section>
            ) : (
              children
            )}
          </main>
        </div>
        {menuOpen && (
          <Dialog
            title="Administration menu"
            onClose={() => setMenuOpen(false)}
          >
            <div className="admin-mobile-navigation">{navigation}</div>
          </Dialog>
        )}
      </div>
    </UserContext.Provider>
  );
}
