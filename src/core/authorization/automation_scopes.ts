import type { Capability } from "./AuthorizationService";

export const scopeDefinitions = {
  "projects:manage": { label: "Archive, restore or unpublish requested projects", capability: "cms.publish" },
  "directory:manage": { label: "Restore or unpublish requested directory profiles", capability: "cms.publish" },
  "media:manage": { label: "Edit, hide or delete requested images", capability: "media.manage" },
  "files:manage": { label: "Edit, hide or delete requested PDF, audio and video files", capability: "media.manage" },
  "website:organize": {
    label: "Organize page drafts and create reusable sections",
    capability: "cms.edit",
  },
  "files:read": {
    label: "Read PDF, audio and video metadata",
    capability: "media.manage",
  },
  "files:download": {
    label: "Read private PDF, audio and video bytes",
    capability: "media.manage",
  },
  "files:write": {
    label: "Upload private PDFs, audio and video",
    capability: "media.manage",
  },
  "files:publish": {
    label: "Make requested files public",
    capability: "media.manage",
  },
  "albums:read": {
    label: "Read saved photo albums",
    capability: "media.manage",
  },
  "albums:write": {
    label: "Create and edit album drafts",
    capability: "media.manage",
  },
  "albums:publish": {
    label: "Publish requested albums",
    capability: "cms.publish",
  },
  "albums:manage": {
    label: "Unpublish or delete requested unused albums",
    capability: "media.manage",
  },
  "members:read": {
    label: "Read private member names, email and membership status",
    capability: "members.review",
  },
  "members:decide": {
    label: "Approve, reject or suspend requested memberships",
    capability: "members.manage",
  },
  "access:roles": {
    label: "Change requested staff roles and event team access",
    capability: "members.manage",
  },
  "access:ownership": {
    label: "Change requested owner access",
    capability: "ownership.manage",
  },
  "responses:read": {
    label: "Read private form answers and applicant identity",
    capability: "submissions.read",
  },
  "responses:write": {
    label: "Update requested response statuses",
    capability: "submissions.manage",
  },
  "responses:export": {
    label: "Export requested private form responses",
    capability: "submissions.export",
  },
  "responses:delete": {
    label: "Permanently delete requested non-registration responses",
    capability: "submissions.manage",
  },
  "registrations:read": {
    label: "Read authorized event registrations and attendee identity",
    capability: "events.manage",
  },
  "registrations:manage": {
    label: "Cancel requested event registrations",
    capability: "events.manage",
  },
  "guests:read": {
    label: "Read authorized event guest access",
    capability: "events.manage",
  },
  "guests:access": {
    label: "Grant or revoke requested event guest access",
    capability: "events.manage",
  },
  "events:operate": {
    label: "Apply requested event registration and feature settings",
    capability: "events.manage",
  },
  "events:manage": {
    label: "Archive or cancel requested events",
    capability: "events.manage",
  },
  "forms:settings": {
    label: "Edit requested form recipients and retention settings",
    capability: "forms.settings",
  },
  "forms:manage": {
    label: "Archive or restore requested forms",
    capability: "forms.edit",
  },
  "forms:delete": {
    label: "Permanently delete requested archived forms",
    capability: "forms.settings",
  },
  "communications:templates": {
    label: "Prepare shared notification email drafts",
    capability: "integrations.manage",
  },
  "communications:publish": {
    label: "Activate requested notification email templates",
    capability: "integrations.manage",
  },
  "communications:send": {
    label: "Retry requested failed form alerts to configured staff",
    capability: "submissions.manage",
  },
  "website:read": { label: "Read website content", capability: "cms.edit" },
  "website:write": {
    label: "Create and edit website drafts",
    capability: "cms.edit",
  },
  "website:manage": {
    label: "Copy pages, add languages and restore drafts",
    capability: "cms.edit",
  },
  "website:settings": {
    label: "Edit draft website menus and appearance",
    capability: "cms.edit",
  },
  "website:publish": {
    label: "Publish website content and settings on request",
    capability: "cms.publish",
  },
  "sources:read": {
    label: "Read approved reference websites",
    capability: "cms.edit",
  },
  "media:read": {
    label: "Read the club media catalogue",
    capability: "media.manage",
  },
  "media:write": {
    label: "Upload images and edit private media metadata",
    capability: "media.manage",
  },
  "media:inspect": {
    label: "View image pixels, including private media",
    capability: "media.manage",
  },
  "media:publish": {
    label: "Make reviewed images public on request",
    capability: "media.manage",
  },
  "website:preview": {
    label: "Capture private website previews",
    capability: "cms.edit",
  },
  "forms:read": {
    label: "Read form definitions (no responses)",
    capability: "forms.edit",
  },
  "forms:write": {
    label: "Create and edit form drafts",
    capability: "forms.edit",
  },
  "forms:publish": {
    label: "Publish forms on request",
    capability: "forms.edit",
  },
  "events:read": {
    label: "Read event content (no guest records)",
    capability: "events.create",
  },
  "events:write": {
    label: "Create and edit event drafts",
    capability: "events.create",
  },
  "events:prepare": {
    label: "Prepare event setup, packages and prizes for review",
    capability: "events.create",
  },
  "events:publish": {
    label: "Publish event content on request",
    capability: "events.create",
  },
  "directory:read": {
    label: "Read directory profiles",
    capability: "cms.edit",
  },
  "directory:write": {
    label: "Create and edit directory drafts",
    capability: "cms.edit",
  },
  "directory:publish": {
    label: "Publish directory profiles on request",
    capability: "cms.publish",
  },
  "projects:read": {
    label: "Read project stories and drafts",
    capability: "cms.edit",
  },
  "projects:write": {
    label: "Create and edit project drafts",
    capability: "cms.edit",
  },
  "projects:publish": {
    label: "Publish project stories on request",
    capability: "cms.publish",
  },
  "calendar:read": {
    label: "Read calendars and activity schedules",
    capability: "calendar.manage",
  },
  "calendar:write": {
    label: "Create and manage calendar and activity drafts",
    capability: "calendar.manage",
  },
  "calendar:design": {
    label: "Edit draft calendar page design",
    capability: "calendar.manage",
  },
  "calendar:publish": {
    label: "Publish calendars, activities and page design on request",
    capability: "calendar.manage",
  },
} satisfies Record<string, { label: string; capability: Capability }>;
export type AutomationScope = keyof typeof scopeDefinitions;
