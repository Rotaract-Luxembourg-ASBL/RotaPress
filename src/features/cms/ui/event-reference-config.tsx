"use client";
import type { Config } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";
import { assetField } from "./puck-fields";
import {
  EventFooterBlock,
  EventHeroBlock,
  EventImpactBlock,
  EventPracticalBlock,
} from "@/features/events/ui/event-reference-blocks";

const version = {
  type: "custom",
  visible: false,
  render: () => <></>,
} as const;
const heading = { type: "text", label: "Heading" } as const;
const buttonLabel = { type: "text", label: "Button label" } as const;
const buttonHref = { type: "text", label: "Button destination" } as const;
const switchField = (label: string) => ({
  type: "radio" as const,
  label,
  options: [
    { label: "Show", value: true },
    { label: "Hide", value: false },
  ],
});

export const eventReferenceConfig: Pick<
  Config<PuckBlocks>["components"],
  "EventHero" | "EventPractical" | "EventImpact" | "EventFooter"
> = {
  EventHero: {
    label: "Event introduction",
    fields: {
      version,
      badge: { type: "text", label: "Small label above the title" },
      tagline: { type: "text", label: "Tagline" },
      assetId: { ...assetField, label: "Background artwork" },
      imageAlt: { type: "text", label: "Artwork description" },
      layout: {
        type: "radio",
        label: "Introduction layout",
        options: [
          { label: "Centered", value: "centered" },
          { label: "Left aligned", value: "left" },
          { label: "Split image", value: "split" },
        ],
      },
      height: {
        type: "radio",
        label: "Introduction height",
        options: [
          { label: "Full screen", value: "full" },
          { label: "Compact", value: "compact" },
        ],
      },
      overlay: { type: "number", label: "Darken artwork (%)", min: 0, max: 85 },
      countdown: switchField("Countdown"),
      buttonLabel,
      buttonHref,
    },
    defaultProps: {
      version: 1,
      badge: "You are invited",
      tagline: "An evening of connection. A wave of change.",
      assetId: "",
      imageAlt: "",
      layout: "centered",
      height: "full",
      overlay: 35,
      countdown: true,
      buttonLabel: "Discover the event",
      buttonHref: "",
    },
    render: (props) => <EventHeroBlock {...props} preview />,
  },
  EventPractical: {
    label: "Practical information",
    fields: {
      version,
      title: heading,
      address: { type: "textarea", label: "Full address" },
      directions: { type: "text", label: "Directions link" },
      items: {
        type: "array",
        label: "Useful details",
        max: 20,
        defaultItemProps: { label: "", text: "" },
        arrayFields: {
          label: { type: "text", label: "Label" },
          text: { type: "textarea", label: "Details" },
        },
      },
    },
    defaultProps: {
      version: 1,
      title: "Practical information",
      address: "",
      directions: "",
      items: [],
    },
    render: (props) => <EventPracticalBlock {...props} />,
  },
  EventImpact: {
    label: "Fundraising & impact",
    fields: {
      version,
      title: heading,
      introduction: { type: "textarea", label: "Introduction" },
      heading: { type: "text", label: "Project heading" },
      text: { type: "textarea", label: "Project story" },
      items: {
        type: "array",
        label: "Goals and highlights",
        max: 8,
        defaultItemProps: { label: "", text: "" },
        arrayFields: {
          label: { type: "text", label: "Label" },
          text: { type: "text", label: "Value or summary" },
        },
      },
      buttonLabel,
      buttonHref,
    },
    defaultProps: {
      version: 1,
      title: "Your evening. A concrete impact.",
      introduction: "",
      heading: "The project we support",
      text: "",
      items: [],
      buttonLabel: "",
      buttonHref: "",
    },
    render: (props) => <EventImpactBlock {...props} />,
  },
  EventFooter: {
    label: "Event footer",
    fields: {
      version,
      heading,
      text: { type: "textarea", label: "Closing message" },
      email: { type: "text", label: "Public contact email" },
      showNavigation: switchField("Links to visible sections"),
      links: {
        type: "array",
        label: "Social and useful links",
        max: 8,
        defaultItemProps: { label: "", href: "" },
        arrayFields: {
          label: { type: "text", label: "Link label" },
          href: { type: "text", label: "Link destination" },
        },
      },
    },
    defaultProps: {
      version: 1,
      heading: "See you there.",
      text: "",
      email: "",
      showNavigation: true,
      links: [],
    },
    render: (props) => <EventFooterBlock {...props} />,
  },
};
