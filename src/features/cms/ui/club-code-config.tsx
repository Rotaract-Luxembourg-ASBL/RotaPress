"use client";

import type { Config } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";
import { clubDetailKeys, clubDetailLabels } from "../club_details";
import { ClubDetailsBlock } from "./club-details-block";
import { CustomCodePreview } from "./custom-code-block";

const version = {
  type: "custom" as const,
  visible: false,
  render: () => <></>,
};
export const clubCodeConfig: Pick<
  Config<PuckBlocks>["components"],
  "ClubDetails" | "CustomCode"
> = {
  ClubDetails: {
    label: "Club details",
    fields: {
      version,
      title: { type: "text", label: "Heading" },
      fields: {
        type: "array",
        label: "Details to show",
        max: 19,
        getItemSummary: (item) => clubDetailLabels[item.field],
        arrayFields: {
          field: {
            type: "select",
            label: "Club information",
            options: clubDetailKeys.map((key) => ({
              label: clubDetailLabels[key],
              value: key,
            })),
          },
        },
        defaultItemProps: { field: "city" },
      },
      layout: {
        type: "select",
        options: [
          { label: "List", value: "list" },
          { label: "Columns", value: "columns" },
        ],
      },
      showLabels: {
        type: "radio",
        label: "Show labels",
        options: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
      },
    },
    defaultProps: {
      version: 1,
      title: "Our club",
      fields: [
        { field: "districtNumber" },
        { field: "city" },
        { field: "country" },
        { field: "polarisUrl" },
      ],
      layout: "list",
      showLabels: true,
    },
    render: (props) => (
      <>
        <p className="field-help">
          Connected to Settings → Club & region. Empty details are hidden.
        </p>
        <ClubDetailsBlock {...props} />
      </>
    ),
  },
  CustomCode: {
    label: "Custom HTML / JS",
    fields: {
      version,
      title: { type: "text", label: "Accessible frame title" },
      html: { type: "textarea", label: "HTML" },
      css: { type: "textarea", label: "CSS" },
      javascript: { type: "textarea", label: "JavaScript" },
      height: {
        type: "number",
        label: "Frame height (pixels)",
        min: 80,
        max: 1600,
      },
    },
    defaultProps: {
      version: 1,
      title: "Custom content",
      html: "<p>Your custom content</p>",
      css: "",
      javascript: "",
      height: 240,
    },
    render: (props) => <CustomCodePreview {...props} />,
  },
};
