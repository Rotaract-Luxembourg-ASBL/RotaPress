"use client";

import type { Config } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";
import { sitePartBlockTypes } from "../cms_schemas";
import { assetField } from "./puck-fields";
import {
  SiteBrandBlock,
  SiteMenuBlock,
  SiteContactBlock,
  SiteSocialBlock,
  SiteFooterTextBlock,
  SiteRowBlock,
} from "./site-part-blocks";

const versionField = {
  type: "custom" as const,
  visible: false,
  render: () => <></>,
};
const slot = {
  type: "slot" as const,
  allow: sitePartBlockTypes.filter((type) => type !== "SiteRow"),
};

export const siteBlockConfig: Pick<
  Config<PuckBlocks>["components"],
  | "SiteBrand"
  | "SiteMenu"
  | "SiteContact"
  | "SiteSocial"
  | "SiteFooterText"
  | "SiteRow"
> = {
  SiteRow: {
    label: "Layout row",
    fields: {
      sticky: {
        type: "radio",
        label: "Keep header visible while scrolling",
        options: [
          { label: "No", value: false },
          { label: "Yes (header only)", value: true },
        ],
      },
      version: versionField,
      layout: {
        type: "select",
        label: "Column widths",
        options: [
          { label: "Equal columns", value: "balanced" },
          { label: "Wider left", value: "wide-left" },
          { label: "Wider center", value: "wide-center" },
          { label: "Wider right", value: "wide-right" },
        ],
      },
      flow: {
        type: "radio",
        label: "Contents",
        options: [
          { label: "Header row", value: "row" },
          { label: "Footer columns", value: "columns" },
        ],
      },
      spacing: {
        type: "radio",
        label: "Spacing",
        options: [
          { label: "Compact", value: "compact" },
          { label: "Comfortable", value: "comfortable" },
        ],
      },
      left: { ...slot, label: "Left column" },
      center: { ...slot, label: "Center column" },
      right: { ...slot, label: "Right column" },
    },
    defaultProps: {
      version: 1,
      layout: "balanced",
      flow: "columns",
      spacing: "comfortable",
      left: [],
      center: [],
      right: [],
    },
    render: ({ left: Left, center: Center, right: Right, ...props }) => (
      <SiteRowBlock
        {...props}
        left={<Left minEmptyHeight={64} />}
        center={<Center minEmptyHeight={64} />}
        right={<Right minEmptyHeight={64} />}
      />
    ),
  },
  SiteBrand: {
    label: "Club logo & name",
    fields: {
      version: versionField,
      assetId: { ...assetField, label: "Logo override (optional)" },
      templateBrand: {
        type: "custom",
        label: "Template fallback mark",
        render: ({ value, onChange, readOnly }) => (
          <label className="field">
            <span>Built-in mark</span>
            <select
              value={value ?? ""}
              disabled={readOnly}
              onChange={(event) => {
                const choice = event.target.value;
                onChange(
                  choice === "rotary" || choice === "rotaract"
                    ? choice
                    : undefined,
                );
              }}
            >
              <option value="">Club name only</option>
              <option value="rotary">Rotary</option>
              <option value="rotaract">Rotaract</option>
            </select>
            <small>
              The shared logo is set in Website → Branding &amp; appearance.
              This mark is used when shared branding follows the template and no
              logo is selected. A built-in mark shows the club name separately.
            </small>
          </label>
        ),
      },
      alt: { type: "text", label: "Logo alternative text" },
      label: { type: "text", label: "Name (blank uses club identity)" },
      showName: {
        type: "radio",
        label: "Show name with uploaded logo",
        options: [
          { label: "Yes", value: true },
          { label: "Logo only", value: false },
        ],
      },
      logoSize: {
        type: "select",
        label: "Logo size",
        options: [
          { label: "Small", value: "small" },
          { label: "Medium", value: "medium" },
          { label: "Large", value: "large" },
        ],
      },
    },
    defaultProps: {
      version: 1,
      assetId: "",
      alt: "",
      label: "",
      showName: true,
      logoSize: "medium",
    },
    render: (props) => <SiteBrandBlock {...props} />,
  },
  SiteMenu: {
    label: "Shared menu",
    fields: {
      version: versionField,
      menuKey: {
        type: "select",
        label: "Shared menu",
        options: [
          { label: "Main menu · edit in Website navigation", value: "primary" },
        ],
      },
      label: { type: "text", label: "Menu label" },
      layout: {
        type: "radio",
        label: "Menu layout",
        options: [
          { label: "Horizontal with phone toggle", value: "horizontal" },
          { label: "Vertical", value: "vertical" },
        ],
      },
    },
    defaultProps: {
      version: 1,
      menuKey: "primary",
      label: "Main menu",
      layout: "horizontal",
    },
    render: (props) => <SiteMenuBlock {...props} />,
  },
  SiteContact: {
    label: "Contact details",
    fields: {
      version: versionField,
      title: { type: "text", label: "Heading" },
      email: { type: "text", label: "Contact email" },
      phone: { type: "text", label: "Contact phone" },
      address: { type: "textarea", label: "Address" },
    },
    defaultProps: {
      version: 1,
      title: "Contact",
      email: "",
      phone: "",
      address: "",
    },
    render: (props) => <SiteContactBlock {...props} />,
  },
  SiteSocial: {
    label: "Shared social links",
    fields: {
      version: versionField,
      label: { type: "text", label: "Links label" },
    },
    defaultProps: { version: 1, label: "Social links" },
    render: (props) => <SiteSocialBlock {...props} />,
  },
  SiteFooterText: {
    label: "Shared footer text",
    fields: { version: versionField },
    defaultProps: { version: 1 },
    render: () => <SiteFooterTextBlock />,
  },
};
