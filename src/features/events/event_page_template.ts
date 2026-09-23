import type { CmsData } from "../cms/cms_schemas";
import { eventModules, type EventPageModuleKey } from "./event_modules";
import { withDefaultEventDesign } from "./event_design";

/** Stable recipe IDs keep preview confirmation bound to exactly the same copy. */
export function eventPageTemplate(moduleKey: EventPageModuleKey): CmsData {
  if (moduleKey === "website") return referenceEventPage();
  const content: CmsData["content"] = [
    {
      type: "Heading",
      props: {
        id: `${moduleKey}-heading`,
        version: 1,
        text: eventModules[moduleKey].label,
        level: "h2",
      },
    },
  ];
  return withDefaultEventDesign({ root: { props: {} }, content });
}

/** An editable composition, with no copied bookings, figures or provider links. */
export function referenceEventPage(): CmsData {
  return {
    root: {
      props: {
        eventLayout: "standalone",
        eventDesign: {
          palette: "gala",
          primaryColor: null,
          backgroundColor: null,
          textColor: null,
          font: "modern",
          width: "wide",
          presentation: "reference",
          navigation: true,
          spacing: "comfortable",
          corners: "rounded",
        },
      },
    },
    content: [
      {
        type: "EventHero",
        props: {
          id: "event-introduction",
          version: 1,
          badge: "You are invited",
          tagline: "",
          assetId: "",
          imageAlt: "",
          layout: "centered",
          height: "full",
          overlay: 25,
          countdown: true,
          buttonLabel: "Discover the event",
          buttonHref: "#event-section-event-programme",
        },
      },
      {
        type: "Programme",
        props: {
          id: "event-programme",
          version: 1,
          title: "The experience",
          introduction: "",
          items: [],
        },
      },
      {
        type: "EventImpact",
        props: {
          id: "event-impact",
          version: 1,
          title: "Your evening. A concrete impact.",
          introduction: "",
          heading: "The project we support",
          text: "",
          items: [],
          buttonLabel: "",
          buttonHref: "",
        },
      },
      {
        type: "PartnerCollection",
        props: {
          id: "event-partners",
          version: 1,
          title: "Partners & Supporters",
          partnerIds: [],
          selectionMode: "selected",
          presentation: "cards",
        },
      },
      {
        type: "EventPractical",
        props: {
          id: "event-practical",
          version: 1,
          title: "Practical information",
          address: "",
          directions: "",
          items: [],
        },
      },
      { type: "FAQ", props: { id: "event-faq", version: 1, items: [] } },
      {
        type: "EventContact",
        props: {
          id: "event-contact",
          version: 1,
          title: "A question before you join?",
          text: "",
          email: "",
          phone: "",
          website: "",
        },
      },
      {
        type: "EventShare",
        props: {
          id: "event-share",
          version: 1,
          title: "An evening worth sharing.",
        },
      },
      {
        type: "EventFooter",
        props: {
          id: "event-footer",
          version: 1,
          heading: "See you there.",
          text: "",
          email: "",
          links: [],
          showNavigation: true,
        },
      },
    ],
  };
}
