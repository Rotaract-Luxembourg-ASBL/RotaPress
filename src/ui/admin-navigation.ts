import type { CurrentUser } from "./api";
import type { IconName } from "./icon";

export type AdminDestination = {
  href: string;
  label: string;
  icon: IconName;
  group: "" | "Website" | "Activities" | "Community" | "Administration";
  keywords?: string;
};

/** Presentation follows current authority; destination services remain authoritative. */
export function adminDestinations(me: CurrentUser): AdminDestination[] {
  const can = (capability: string) => me.capabilities.includes(capability);
  const destinations: Array<AdminDestination & { visible: boolean }> = [
    {
      href: "/admin",
      label: "Overview",
      icon: "overview",
      group: "",
      visible: true,
    },
    {
      href: "/admin/website",
      label: "Website",
      icon: "website",
      group: "Website",
      keywords: "pages design navigation templates appearance",
      visible: can("cms.edit"),
    },
    {
      href: "/admin/media",
      label: "Media",
      icon: "image",
      group: "Website",
      keywords: "images photos albums files upload gallery",
      visible: can("media.manage"),
    },
    {
      href: "/admin/events",
      label: "Events",
      icon: "calendar",
      group: "Activities",
      keywords: "registrations bookings guests",
      visible: can("events.access"),
    },
    {
      href: "/admin/projects",
      label: "Projects",
      icon: "outline",
      group: "Activities",
      keywords: "volunteer stories initiatives",
      visible: can("cms.edit"),
    },
    {
      href: "/admin/calendar",
      label: "Calendar",
      icon: "calendar",
      group: "Activities",
      keywords: "activities schedules reminders",
      visible: can("calendar.manage"),
    },
    {
      href: "/admin/forms",
      label: "Forms",
      icon: "forms",
      group: "Community",
      keywords: "questions applications surveys",
      visible: can("forms.edit"),
    },
    {
      href: "/admin/inbox",
      label: "Response center",
      icon: "mail",
      group: "Community",
      keywords: "submissions answers inbox",
      visible:
        me.features.forms &&
        (can("submissions.read") || can("events.responses.access")),
    },
    {
      href: "/admin/members",
      label: "Members",
      icon: "members",
      group: "Community",
      keywords: "applications approvals roles people",
      visible: can("members.review") || can("members.manage"),
    },
    {
      href: "/admin/partners",
      label: "Community directory",
      icon: "members",
      group: "Community",
      keywords: "partners sponsors team profiles",
      visible: can("cms.edit"),
    },
    {
      href: "/admin/integrations",
      label: "Integrations",
      icon: "settings",
      group: "Administration",
      keywords: "connections AI MCP REST email Google Luma",
      visible: can("integrations.manage"),
    },
    {
      href: "/admin/settings",
      label: "Settings",
      icon: "controls",
      group: "Administration",
      keywords: "club identity permissions configuration",
      visible: can("settings.manage"),
    },
  ];
  return destinations.filter((item) => item.visible);
}

export function adminCommands(me: CurrentUser): AdminDestination[] {
  const destinations = adminDestinations(me);
  if (me.capabilities.includes("cms.edit")) {
    destinations.push(
      {
        href: "/admin/website?tab=pages",
        label: "Pages",
        icon: "website",
        group: "Website",
        keywords: "content edit hierarchy",
      },
      {
        href: "/admin/website?tab=templates",
        label: "Website templates",
        icon: "overview",
        group: "Website",
        keywords: "starting design layout",
      },
      {
        href: "/admin/website?tab=menus",
        label: "Navigation menus",
        icon: "outline",
        group: "Website",
        keywords: "links home page",
      },
      {
        href: "/admin/website?tab=appearance",
        label: "Branding and appearance",
        icon: "controls",
        group: "Website",
        keywords: "logo colors fonts",
      },
    );
  }
  if (me.capabilities.includes("integrations.manage")) {
    destinations.push(
      {
        href: "/admin/integrations/mcp",
        label: "AI connections (MCP)",
        icon: "settings",
        group: "Administration",
        keywords: "assistant ChatGPT Claude permissions",
      },
      {
        href: "/admin/integrations/rest",
        label: "REST API",
        icon: "settings",
        group: "Administration",
        keywords: "tokens developer automation",
      },
    );
  }
  return destinations;
}
