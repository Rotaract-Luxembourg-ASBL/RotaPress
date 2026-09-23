import { block } from "./recipe_helpers";

export const sectionPatterns = [
  {
    id: "calendar",
    name: "Community agenda",
    description:
      "A compact calendar of published activities, with date and view controls.",
    create: () =>
      block("Calendar", {
        title: "This month at the club",
        calendarIds: [],
        view: "agenda",
        timezone: "UTC",
      }),
  },
  {
    id: "contact",
    name: "Contact form",
    description:
      "Select a form or create a contact form in the block settings.",
    create: () => block("Form", { formId: "" }),
  },
  {
    id: "team",
    name: "Published team profiles",
    description:
      "Automatically show published Team profiles from your directory.",
    create: () =>
      block("PartnerCollection", {
        title: "Meet our team",
        partnerIds: [],
        selectionMode: "category",
        category: "team",
        presentation: "cards",
      }),
  },
  {
    id: "partners",
    name: "Published partner logos",
    description: "Automatically show published Partners from your directory.",
    create: () =>
      block("PartnerCollection", {
        title: "Stronger together",
        partnerIds: [],
        selectionMode: "category",
        category: "partner",
        presentation: "logos",
      }),
  },
  {
    id: "intro",
    name: "Image left introduction",
    description: "A photograph beside an editable heading and story.",
    create: () =>
      block("FeatureSection", {
        eyebrow: "Meet the club",
        title: "People make the difference.",
        body: "Bring your perspective and discover what we can do together.",
        assetId: "",
        alt: "",
        imagePosition: "left",
        items: [],
        buttonLabel: "",
        buttonHref: "",
      }),
  },
  {
    id: "projects",
    name: "Three project cards",
    description:
      "Choose published CMS pages; titles, images and links stay current.",
    create: () =>
      block("PageCollection", {
        title: "Our projects",
        introduction: "Ideas brought to life through shared effort.",
        pageIds: [],
        layout: "cards",
        emptyText: "Projects will appear here.",
        design: { columns: "three" },
      }),
  },
  {
    id: "activities",
    name: "Upcoming activities",
    description: "Published events from the Events feature.",
    create: () =>
      block("EventCollection", {
        title: "Come together",
        introduction: "Find your next opportunity to take part.",
        period: "upcoming",
        limit: 3,
        layout: "cards",
      }),
  },
  {
    id: "story-slider",
    name: "Photographic story slider",
    description: "Editable slides with manual navigation and focal points.",
    create: () =>
      block("HeroSlider", {
        label: "Featured stories",
        position: "left",
        items: [
          {
            title: "A shared idea starts here.",
            body: "Discover what brings us together.",
            assetId: "",
            alt: "",
            buttonLabel: "",
            buttonHref: "",
          },
          {
            title: "Make room for connection.",
            body: "A different perspective on our community.",
            assetId: "",
            alt: "",
            buttonLabel: "",
            buttonHref: "",
          },
        ],
      }),
  },
  {
    id: "featured",
    name: "Featured stories carousel",
    description: "A manual carousel of selected published CMS pages.",
    create: () =>
      block("PageCollection", {
        title: "In focus",
        introduction: "",
        pageIds: [],
        layout: "carousel",
        emptyText: "",
      }),
  },
  {
    id: "timeline",
    name: "A simple timeline",
    description: "Supply real milestones, dates and descriptions.",
    create: () =>
      block("Programme", {
        title: "Our story so far",
        introduction: "",
        items: [{ time: "", title: "A moment to remember", description: "" }],
      }),
  },
  {
    id: "footer",
    name: "Identity, menu & contact footer",
    description:
      "Three responsive columns using shared menu and identity references.",
    create: () =>
      block("SiteRow", {
        layout: "wide-left",
        flow: "columns",
        spacing: "comfortable",
        left: [
          block("SiteBrand", {
            assetId: "",
            alt: "",
            label: "",
            logoSize: "large",
            showName: true,
          }),
        ],
        center: [
          block("SiteMenu", {
            menuKey: "primary",
            label: "Explore",
            layout: "vertical",
          }),
        ],
        right: [
          block("SiteContact", {
            title: "Contact",
            email: "",
            phone: "",
            address: "",
          }),
          block("SiteSocial", { label: "Follow us" }),
        ],
      }),
  },
];
