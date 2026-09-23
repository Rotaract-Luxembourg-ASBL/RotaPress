import type { CmsLocale } from "../cms/cms_schemas";
import type { EventModuleState } from "./event_modules";

/** Staff guidance only. Every mutation and public read still checks current authority. */
export type EventModuleReadiness = EventModuleState & {
  available: boolean;
  reasons: string[];
};

export type EventParticipationPlacement = {
  /** Visible block in the saved draft, independent of publication. */
  draft: boolean;
  /** Visible block in the actual published revision, independent of later drafts. */
  published: boolean;
  /** Public renderer can show the section; native closed/full cards still qualify. */
  live: boolean;
  pages: {
    id: string;
    locale: CmsLocale;
    moduleKey: "website";
    draft: boolean;
    published: boolean;
    live: boolean;
    editorHref: string | null;
    publicHref: string | null;
  }[];
};

export type EventReadiness = {
  eventId: string;
  eventPublished: boolean;
  publishedVisibility: "public" | "unlisted" | "private" | null;
  archived: boolean;
  cancelled: boolean;
  modules: EventModuleReadiness[];
  forms: {
    publishedCount: number;
    available: boolean;
    reasons: string[];
    placement: EventParticipationPlacement;
  };
  registration: {
    authority: "none" | "native" | "luma";
    formId: string | null;
    formPublished: boolean;
    open: boolean;
    full: boolean;
    available: boolean;
    reasons: string[];
    placement: EventParticipationPlacement;
  };
};
