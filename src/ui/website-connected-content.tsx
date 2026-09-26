"use client";

import Link from "next/link";
import { useCurrentUser } from "./admin-shell";

export function WebsiteConnectedContent({
  contactFormId,
}: {
  contactFormId?: string | null;
}) {
  const { features, capabilities } = useCurrentUser();
  const items = [
    {
      title: "Projects",
      text: "Share volunteer stories and community initiatives. Projects blocks update from published stories.",
      href: "/admin/projects",
      visible: features.projects && capabilities.includes("cms.edit"),
    },
    {
      title: "Calendar",
      text: "Publish activities and recurring schedules. Calendar blocks update from this workspace.",
      href: "/admin/calendar",
      visible: features.calendar && capabilities.includes("calendar.manage"),
    },
    {
      title: "Events",
      text: "Publish event details and registration options, or design the Events directory.",
      href: "/admin/events",
      visible: features.events && capabilities.includes("events.manage"),
    },
    {
      title: "Contact form",
      text: "Review questions and design, then publish the form before publishing your Contact page.",
      href: contactFormId ? `/admin/forms/${contactFormId}` : "/admin/forms",
      visible: features.forms && capabilities.includes("forms.edit"),
    },
    {
      title: "Team & partners",
      text: "Publish directory profiles. Automatic category blocks keep your website up to date.",
      href: "/admin/partners",
      visible: capabilities.includes("cms.edit"),
    },
  ].filter((item) => item.visible);
  if (!items.length) return null;
  return (
    <section aria-label="Content connected to your website">
      <div className="website-section-heading">
        <h2>Content connected to your website</h2>
        <p>
          Arrange blocks in the page editor. Update their content in its own
          workspace.
        </p>
      </div>
      <div className="website-task-grid">
        {items.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="panel website-task"
          >
            <strong>{item.title}</strong>
            <span>{item.text}</span>
            <span>Open →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
