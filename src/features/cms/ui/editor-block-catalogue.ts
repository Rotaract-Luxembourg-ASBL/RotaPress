import type { IconName } from "@/ui/icon";
import { puckConfig, type PuckBlocks } from "./puck-config";

export type BlockLibraryGroup = "content" | "layout" | "connected";
export type BlockMetadata = {
  label: string;
  description: string;
  icon: IconName;
  group: BlockLibraryGroup;
  sourceLabel?: string;
};

type BlockDetails = Omit<BlockMetadata, "label" | "group"> & {
  group?: BlockLibraryGroup;
};

const blockDetails: Record<keyof PuckBlocks, BlockDetails> = {
  ClubDetails: {
    description: "Show public club details, meetings and contact information.",
    icon: "members",
    sourceLabel: "Club settings",
  },
  CustomCode: {
    description: "Build an isolated widget with HTML, CSS and JavaScript.",
    icon: "controls",
  },
  Calendar: {
    description:
      "Combine calendars, recurring activities and published events.",
    icon: "calendar",
    sourceLabel: "Calendar",
  },
  PageIntro: {
    description: "Welcome visitors with a heading and a short introduction.",
    icon: "website",
  },
  PageCollection: {
    description: "Keep cards linked to your published website pages.",
    icon: "website",
    sourceLabel: "Website pages",
  },
  Columns: {
    description: "Arrange two groups of blocks side by side.",
    icon: "settings",
    group: "layout",
  },
  EventHero: {
    description: "Introduce the event with its public name and key details.",
    icon: "calendar",
    sourceLabel: "This event",
  },
  EventPractical: {
    description: "Show the event's date, venue and practical information.",
    icon: "calendar",
    sourceLabel: "This event",
  },
  EventImpact: {
    description: "Explain the cause and the event's community impact.",
    icon: "members",
  },
  EventFooter: {
    description: "Close the event page with its public contact information.",
    icon: "mail",
  },
  EventPrizes: {
    description: "Display the event's separately published prize gallery.",
    icon: "image",
    sourceLabel: "Event prizes",
  },
  EventWinners: {
    description: "Show reviewed public names from demonstration draws.",
    icon: "members",
    sourceLabel: "Event draws",
  },
  EventPackages: {
    description: "Display published offers and external checkout links.",
    icon: "ticket",
    sourceLabel: "Event packages",
  },
  EventContact: {
    description: "Show public contact details for the event team.",
    icon: "mail",
  },
  EventFlyer: {
    description: "Display the event's public flyer image.",
    icon: "image",
  },
  EventShare: {
    description: "Let visitors share the published event's link.",
    icon: "external",
    sourceLabel: "This event",
  },
  EventRegistration: {
    description:
      "Let visitors register using the event's participation settings.",
    icon: "ticket",
    sourceLabel: "Event registration",
  },
  HeroSlider: {
    description: "Tell a story with images, text, buttons and manual slides.",
    icon: "image",
  },
  FeatureSection: {
    description: "Pair an image with benefits and a clear call to action.",
    icon: "overview",
  },
  Programme: {
    description: "Set out times, activities and practical details in order.",
    icon: "outline",
  },
  ParticipationOptions: {
    description: "Present package information and registration links.",
    icon: "ticket",
  },
  EventCollection: {
    description: "Automatically show published public events.",
    icon: "calendar",
    sourceLabel: "Events",
  },
  ProjectCollection: {
    description: "Show published volunteer stories and community initiatives.",
    icon: "overview",
    sourceLabel: "Projects",
  },
  SiteRow: {
    description: "Arrange three columns that stack on phone screens.",
    icon: "settings",
    group: "layout",
  },
  SiteBrand: {
    description: "Show the club's shared identity or a selected logo.",
    icon: "image",
    sourceLabel: "Website branding",
  },
  SiteMenu: {
    description: "Show the website's shared primary navigation.",
    icon: "outline",
    sourceLabel: "Website menus",
  },
  SiteContact: {
    description: "Display an address, email and phone number.",
    icon: "mail",
  },
  SiteSocial: {
    description: "Show the website's shared social links.",
    icon: "external",
    sourceLabel: "Website settings",
  },
  SiteFooterText: {
    description: "Show the website's shared footer text.",
    icon: "edit",
    sourceLabel: "Website settings",
  },
  Hero: {
    description: "Lead with a heading, introduction and optional image.",
    icon: "website",
  },
  Form: {
    description: "Add a contact, volunteer, membership or other reusable form.",
    icon: "forms",
    sourceLabel: "Forms",
  },
  Heading: {
    description: "Give a section a clear heading or subheading.",
    icon: "edit",
  },
  Button: {
    description: "Send visitors to a page or website with a styled link.",
    icon: "external",
  },
  Divider: {
    description: "Separate sections with a simple visual break.",
    icon: "more",
    group: "layout",
  },
  Spacer: {
    description: "Add breathing room between blocks.",
    icon: "controls",
    group: "layout",
  },
  Cover: {
    description: "Place a message over a background image or color.",
    icon: "image",
  },
  ImageSlider: {
    description: "Let visitors browse images using manual slide controls.",
    icon: "image",
  },
  RichText: {
    description: "Write paragraphs, lists and formatted text.",
    icon: "edit",
  },
  Image: {
    description: "Add an image, accessible description and optional caption.",
    icon: "image",
  },
  Gallery: {
    description: "Arrange a collection of images in a grid.",
    icon: "overview",
  },
  Cards: {
    description: "Group related information and links into cards.",
    icon: "overview",
  },
  CallToAction: {
    description: "Give visitors a clear next step.",
    icon: "external",
  },
  Statistics: {
    description: "Highlight meaningful facts and figures.",
    icon: "overview",
  },
  FAQ: {
    description: "Answer common questions in expandable sections.",
    icon: "outline",
  },
  Team: {
    description: "Introduce people with names, photos and short biographies.",
    icon: "members",
  },
  Sponsors: {
    description: "Add names and logos specific to this page.",
    icon: "members",
  },
  PartnerCollection: {
    description: "Choose published partners, sponsors or team profiles.",
    icon: "members",
    sourceLabel: "Community directory",
  },
  SharedSection: {
    description: "Reuse a section's published content on this page.",
    icon: "duplicate",
    sourceLabel: "Reusable sections",
  },
};

export function getBlockMetadata(name: keyof PuckBlocks): BlockMetadata {
  const details = blockDetails[name];
  return {
    ...details,
    label: puckConfig.components[name].label || name,
    group: details.sourceLabel ? "connected" : (details.group ?? "content"),
  };
}
