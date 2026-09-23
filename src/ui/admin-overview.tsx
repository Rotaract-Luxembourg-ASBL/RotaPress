"use client";
import Link from "next/link";
import { useCurrentUser } from "./admin-shell";
import { Arrow, PageHeading } from "./primitives";
import { Icon, type IconName } from "./icon";
import {
  CalendarOverview,
  EventsOverview,
  FormsOverview,
  MembersOverview,
  ResponsesOverview,
  WebsiteOverview,
} from "./overview-workspaces";

export function AdminOverview() {
  const { capabilities, features } = useCurrentUser();
  const can = (capability: string) => capabilities.includes(capability);
  const shortcuts: {
    title: string;
    description: string;
    href: string;
    icon: IconName;
    visible: boolean;
  }[] = [
    {
      title: "Media library",
      description: "Find, upload and reuse images",
      href: "/admin/media",
      icon: "image",
      visible: can("media.manage"),
    },
    {
      title: "Community directory",
      description: "Partners, sponsors and your team",
      href: "/admin/partners",
      icon: "members",
      visible: can("cms.edit"),
    },
    {
      title: "Branding & appearance",
      description: "Your website's shared identity",
      href: "/admin/website?tab=appearance",
      icon: "controls",
      visible: can("cms.edit"),
    },
    {
      title: "Integrations",
      description: "Features, sign-in and email delivery",
      href: "/admin/integrations",
      icon: "settings",
      visible: can("integrations.manage"),
    },
    {
      title: "Club settings",
      description: "Identity, region, domains and security",
      href: "/admin/settings",
      icon: "controls",
      visible: can("settings.manage"),
    },
  ];
  const availableShortcuts = shortcuts.filter((item) => item.visible);
  return (
    <>
      <PageHeading
        title="Overview"
        description="See what needs attention and pick up your club's next task."
      >
        <Link href="/" className="button button-outline">
          View website <Arrow diagonal />
        </Link>
      </PageHeading>
      <div className="dashboard-workspaces">
        {features.forms &&
          (can("submissions.read") || can("events.responses.access")) && (
            <ResponsesOverview />
          )}
        {(can("members.review") || can("members.manage")) && (
          <MembersOverview />
        )}
        {features.events && can("events.access") && <EventsOverview />}
        {features.calendar && can("calendar.manage") && <CalendarOverview />}
        {can("cms.edit") && <WebsiteOverview />}
        {features.forms && can("forms.edit") && <FormsOverview />}
      </div>
      {availableShortcuts.length > 0 && (
        <section
          className="dashboard-shortcuts"
          aria-labelledby="dashboard-shortcuts-title"
        >
          <h2 id="dashboard-shortcuts-title">Manage your club</h2>
          <div>
            {availableShortcuts.map((item) => (
              <Link
                href={item.href}
                key={item.href}
                className="panel dashboard-shortcut"
              >
                <Icon name={item.icon} />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <Arrow />
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
