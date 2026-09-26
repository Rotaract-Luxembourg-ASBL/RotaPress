import type { Capability } from "./AuthorizationService";

export const scopeDefinitions = {
  "website:read": { label: "Read website content", capability: "cms.edit" },
  "website:write": {
    label: "Create and edit website drafts",
    capability: "cms.edit",
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
  "directory:read": {
    label: "Read directory profiles",
    capability: "cms.edit",
  },
  "directory:write": {
    label: "Create and edit directory drafts",
    capability: "cms.edit",
  },
  "calendar:read": {
    label: "Read calendar definitions",
    capability: "calendar.manage",
  },
} satisfies Record<string, { label: string; capability: Capability }>;
export type AutomationScope = keyof typeof scopeDefinitions;
