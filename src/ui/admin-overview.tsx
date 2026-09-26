"use client";

import Link from "next/link";
import { useCurrentUser } from "./admin-shell";
import { Arrow, PageHeading } from "./primitives";
import { Icon, type IconName } from "./icon";
import { useOverviewData } from "./overview-data";
import {
  OverviewAttention,
  OverviewDrafts,
  OverviewForms,
  OverviewMetrics,
  OverviewSchedule,
} from "./overview-workspaces";

export function AdminOverview() {
  const { capabilities } = useCurrentUser();
  const data = useOverviewData();
  const can = (capability: string) => capabilities.includes(capability);
  const shortcuts: {
    title: string;
    href: string;
    icon: IconName;
    visible: boolean;
  }[] = [
    {
      title: "Media library",
      href: "/admin/media",
      icon: "image",
      visible: can("media.manage"),
    },
    {
      title: "Branding & appearance",
      href: "/admin/website?tab=appearance",
      icon: "controls",
      visible: can("cms.edit"),
    },
    {
      title: "Community directory",
      href: "/admin/partners",
      icon: "members",
      visible: can("cms.edit"),
    },
    {
      title: "Integrations",
      href: "/admin/integrations",
      icon: "settings",
      visible: can("integrations.manage"),
    },
    {
      title: "Club settings",
      href: "/admin/settings",
      icon: "controls",
      visible: can("settings.manage"),
    },
  ];
  const availableShortcuts = shortcuts.filter((item) => item.visible);
  return (
    <div className="dashboard">
      <PageHeading
        title="Overview"
        description="Review outstanding work and pick up your next task."
      >
        <div className="dashboard-heading-actions">
          <Link href="/" className="button button-outline">
            View website <Arrow diagonal />
          </Link>
          {data.access.website && (
            <Link
              href="/admin/website?tab=pages"
              className="button button-accent"
            >
              <Icon name="edit" />
              Edit website
            </Link>
          )}
        </div>
      </PageHeading>
      <OverviewMetrics data={data} />
      {(data.access.members || data.access.forms) && (
        <details className="dashboard-count-scope">
          <summary>About these counts</summary>
          <p>
            Counts use the same records as each workspace.
            {data.access.members && " Members includes up to 500 memberships."}
            {data.access.forms &&
              " Forms includes up to 200 recently updated forms."}
            {data.access.responses &&
              " Response totals cover all permitted forms, across every result page."}{" "}
            These are a working summary, not an activity or growth report.
          </p>
        </details>
      )}
      <div className="dashboard-columns">
        <div className="dashboard-main-column">
          <OverviewAttention data={data} />
          <OverviewDrafts data={data} />
        </div>
        <div className="dashboard-side-column">
          <OverviewSchedule data={data} />
          <OverviewForms data={data} />
          {availableShortcuts.length > 0 && (
            <section
              className="dashboard-panel dashboard-shortcuts"
              aria-labelledby="dashboard-shortcuts-title"
            >
              <h2 id="dashboard-shortcuts-title">Quick links</h2>
              <nav aria-label="Club shortcuts">
                {availableShortcuts.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <Icon name={item.icon} />
                    <span>{item.title}</span>
                    <Arrow />
                  </Link>
                ))}
              </nav>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
