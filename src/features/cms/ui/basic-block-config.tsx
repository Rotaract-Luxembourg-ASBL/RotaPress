"use client";

import type { Config } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";
import {
  ButtonBlock,
  CoverBlock,
  DividerBlock,
  HeadingBlock,
  SpacerBlock,
} from "./basic-block-renderers";
import { ImageSliderBlock } from "./image-slider";
import { aspectRatioField, optionalAssetField } from "./puck-fields";
import { SliderField } from "./slider-field";

type BasicName =
  "Heading" | "Button" | "Divider" | "Spacer" | "Cover" | "ImageSlider";
export const basicBlockConfig: Pick<
  Config<PuckBlocks>["components"],
  BasicName
> = {
  Heading: {
    label: "Heading",
    fields: {
      version: { type: "custom", visible: false, render: () => <></> },
      text: { type: "text", label: "Heading text", contentEditable: true },
      level: {
        type: "radio",
        label: "Heading level",
        options: [
          { label: "Heading 2", value: "h2" },
          { label: "Heading 3", value: "h3" },
        ],
      },
    },
    defaultProps: { version: 1, text: "A new chapter", level: "h2" },
    render: (props) => <HeadingBlock {...props} />,
  },
  Button: {
    label: "Button",
    fields: {
      version: { type: "custom", visible: false, render: () => <></> },
      label: { type: "text", label: "Button text" },
      href: { type: "text", label: "Button link" },
      style: {
        type: "radio",
        label: "Button style",
        options: [
          { label: "Filled", value: "accent" },
          { label: "Outline", value: "outline" },
        ],
      },
      alignment: {
        type: "radio",
        label: "Alignment",
        options: [
          { label: "Left", value: "left" },
          { label: "Center", value: "center" },
          { label: "Right", value: "right" },
        ],
      },
    },
    defaultProps: {
      version: 1,
      label: "Learn more",
      href: "",
      style: "accent",
      alignment: "left",
    },
    render: (props) => <ButtonBlock {...props} />,
  },
  Divider: {
    label: "Divider",
    fields: {
      version: { type: "custom", visible: false, render: () => <></> },
      width: {
        type: "radio",
        label: "Divider width",
        options: [
          { label: "Full width", value: "full" },
          { label: "Narrow", value: "narrow" },
        ],
      },
    },
    defaultProps: { version: 1, width: "full" },
    render: (props) => <DividerBlock {...props} />,
  },
  Spacer: {
    label: "Spacer",
    fields: {
      version: { type: "custom", visible: false, render: () => <></> },
      size: {
        type: "radio",
        label: "Space height",
        options: [
          { label: "Small", value: "small" },
          { label: "Medium", value: "medium" },
          { label: "Large", value: "large" },
        ],
      },
    },
    defaultProps: { version: 1, size: "medium" },
    render: (props) => <SpacerBlock {...props} />,
  },
  Cover: {
    label: "Cover section",
    fields: {
      version: { type: "custom", visible: false, render: () => <></> },
      presentation: {
        type: "radio",
        label: "Cover layout",
        options: [
          { label: "Content section", value: "section" },
          { label: "Page banner", value: "banner" },
        ],
      },
      title: { type: "text", label: "Cover heading", contentEditable: true },
      body: { type: "textarea", label: "Cover text", contentEditable: true },
      buttonLabel: { type: "text", label: "Button text" },
      buttonHref: { type: "text", label: "Button link" },
      assetId: optionalAssetField,
      imageOpacity: {
        type: "number",
        label: "Photo visibility (%)",
        min: 0,
        max: 100,
        step: 1,
      },
      tone: {
        type: "radio",
        label: "Background tone",
        options: [
          { label: "Paper", value: "paper" },
          { label: "Sage", value: "sage" },
          { label: "Dark", value: "ink" },
        ],
      },
      padding: {
        type: "radio",
        label: "Inner spacing",
        options: [
          { label: "Small", value: "small" },
          { label: "Medium", value: "medium" },
          { label: "Large", value: "large" },
        ],
      },
      alignment: {
        type: "radio",
        label: "Text alignment",
        options: [
          { label: "Left", value: "left" },
          { label: "Center", value: "center" },
        ],
      },
    },
    defaultProps: {
      version: 1,
      presentation: "section",
      imageOpacity: 15,
      title: "A shared purpose",
      body: "Make room for your club’s next chapter.",
      buttonLabel: "",
      buttonHref: "",
      assetId: "",
      tone: "sage",
      padding: "medium",
      alignment: "left",
    },
    resolveFields: (data, { fields }) => {
      const resolved = { ...fields };
      if (resolved.imageOpacity)
        resolved.imageOpacity = {
          ...resolved.imageOpacity,
          visible: Boolean(data.props.assetId),
        };
      return resolved;
    },
    render: (props) => <CoverBlock {...props} />,
  },
  ImageSlider: {
    label: "Image slider",
    fields: {
      version: { type: "custom", visible: false, render: () => <></> },
      aspectRatio: aspectRatioField,
      visibleImages: {
        type: "select",
        label: "Photos on desktop (one on phone)",
        options: [
          { label: "One photo", value: "one" },
          { label: "Three photos", value: "three" },
          { label: "Four photos", value: "four" },
        ],
      },
      items: {
        type: "custom",
        label: "Slides",
        render: ({ value, onChange }) => (
          <SliderField value={value} onChange={onChange} />
        ),
      },
    },
    defaultProps: {
      version: 1,
      items: [],
      aspectRatio: "landscape",
      visibleImages: "one",
    },
    render: (props) => <ImageSliderBlock {...props} />,
  },
};
