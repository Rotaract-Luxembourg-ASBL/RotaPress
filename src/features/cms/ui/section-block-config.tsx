"use client";

import type { Config } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";
import { assetField } from "./puck-fields";
import { HeroSliderBlock } from "./hero-slider";
import {
  FeatureSectionBlock,
  ProgrammeBlock,
  ParticipationOptionsBlock,
} from "./section-renderers";
import { eventCollectionConfig } from "./event-collection-editor";

const version = {
  type: "custom",
  visible: false,
  render: () => <></>,
} as const;
export const featureIconField = {
  type: "select",
  label: "Icon",
  options: ["none", "heart", "people", "globe", "spark", "calendar"].map(
    (value) => ({
      label:
        value === "none" ? "No icon" : value[0].toUpperCase() + value.slice(1),
      value,
    }),
  ),
} as const;
const sideField = {
  type: "radio",
  options: [
    { label: "Left", value: "left" },
    { label: "Right", value: "right" },
  ],
} as const;
export const sectionBlockConfig: Pick<
  Config<PuckBlocks>["components"],
  | "HeroSlider"
  | "FeatureSection"
  | "Programme"
  | "ParticipationOptions"
  | "EventCollection"
> = {
  HeroSlider: {
    label: "Story hero",
    fields: {
      version,
      label: { type: "text", label: "Carousel label" },
      position: { ...sideField, label: "Text panel position" },
      items: {
        type: "array",
        label: "Slides",
        max: 8,
        arrayFields: {
          title: { type: "text", label: "Heading" },
          body: { type: "textarea", label: "Introduction" },
          assetId: assetField,
          alt: { type: "text", label: "Image description" },
          buttonLabel: { type: "text", label: "Button text" },
          buttonHref: { type: "text", label: "Button link" },
          focalX: {
            type: "number",
            label: "Focal point across (%)",
            min: 0,
            max: 100,
          },
          focalY: {
            type: "number",
            label: "Focal point down (%)",
            min: 0,
            max: 100,
          },
        },
        defaultItemProps: {
          title: "Your next story",
          body: "",
          assetId: "",
          alt: "",
          buttonLabel: "",
          buttonHref: "",
        },
        getItemSummary: (item) => item.title || "Slide",
      },
    },
    defaultProps: {
      version: 1,
      label: "Featured stories",
      position: "left",
      items: [
        {
          title: "People. Purpose. Possibility.",
          body: "Introduce your club and the causes you care about.",
          assetId: "",
          alt: "",
          buttonLabel: "",
          buttonHref: "",
        },
      ],
    },
    render: (props) => <HeroSliderBlock {...props} />,
  },
  FeatureSection: {
    label: "Image & benefits",
    fields: {
      version,
      eyebrow: { type: "text", label: "Eyebrow" },
      title: { type: "text", label: "Heading" },
      body: { type: "textarea", label: "Introduction" },
      assetId: assetField,
      alt: { type: "text", label: "Image description" },
      imagePosition: { ...sideField, label: "Image position" },
      items: {
        type: "array",
        label: "Benefits or activities",
        max: 8,
        arrayFields: {
          title: { type: "text", label: "Title" },
          text: { type: "textarea", label: "Description" },
          icon: featureIconField,
        },
        defaultItemProps: { title: "Your benefit", text: "", icon: "heart" },
        getItemSummary: (item) => item.title || "Benefit",
      },
      buttonLabel: { type: "text", label: "Button text" },
      buttonHref: { type: "text", label: "Button link" },
    },
    defaultProps: {
      version: 1,
      eyebrow: "Get involved",
      title: "Make a difference together",
      body: "Share what your community offers.",
      assetId: "",
      alt: "",
      imagePosition: "left",
      items: [],
      buttonLabel: "",
      buttonHref: "",
    },
    render: (props) => <FeatureSectionBlock {...props} />,
  },
  Programme: {
    label: "Programme timeline",
    fields: {
      version,
      title: { type: "text", label: "Heading" },
      introduction: { type: "textarea", label: "Introduction" },
      items: {
        type: "array",
        label: "Programme items",
        max: 30,
        arrayFields: {
          time: { type: "text", label: "Time or day" },
          title: { type: "text", label: "Activity" },
          description: { type: "textarea", label: "Details" },
        },
        defaultItemProps: { time: "", title: "Activity", description: "" },
        getItemSummary: (item) => `${item.time} ${item.title}`.trim(),
      },
    },
    defaultProps: {
      version: 1,
      title: "The programme",
      introduction: "",
      items: [],
    },
    render: (props) => <ProgrammeBlock {...props} />,
  },
  ParticipationOptions: {
    label: "Participation cards",
    fields: {
      version,
      title: { type: "text", label: "Heading" },
      introduction: { type: "textarea", label: "Introduction" },
      items: {
        type: "array",
        label: "Options (information only; link to registration)",
        max: 6,
        arrayFields: {
          title: { type: "text", label: "Option name" },
          priceLabel: { type: "text", label: "Price or availability label" },
          description: { type: "textarea", label: "Description" },
          badge: { type: "text", label: "Optional badge" },
          features: {
            type: "array",
            label: "Included features",
            max: 12,
            arrayFields: { text: { type: "text", label: "Feature" } },
            defaultItemProps: { text: "" },
            getItemSummary: (item) => item.text || "Feature",
          },
          buttonLabel: { type: "text", label: "Button text" },
          buttonHref: {
            type: "text",
            label: "Registration or information link",
          },
        },
        defaultItemProps: {
          title: "Participation option",
          priceLabel: "",
          description: "",
          badge: "",
          features: [],
          buttonLabel: "",
          buttonHref: "",
        },
        getItemSummary: (item) => item.title || "Option",
      },
    },
    defaultProps: {
      version: 1,
      title: "Ways to take part",
      introduction: "",
      items: [],
    },
    render: (props) => <ParticipationOptionsBlock {...props} />,
  },
  EventCollection: eventCollectionConfig,
};
