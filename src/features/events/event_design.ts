import { z } from "zod";
import type { CSSProperties } from "react";
import type { CmsData } from "../cms/cms_schemas";

const colorOverride = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable()
  .default(null);
export const eventDesignSchema = z.strictObject({
  palette: z.enum(["ocean", "warm", "berry", "gala"]).default("ocean"),
  primaryColor: colorOverride,
  backgroundColor: colorOverride,
  textColor: colorOverride,
  font: z.enum(["modern", "classic"]).default("modern"),
  width: z.enum(["focused", "wide"]).default("wide"),
  // Optional to preserve the exact shape and rendering of older saved revisions.
  presentation: z.enum(["classic", "reference"]).optional(),
  navigation: z.boolean().optional(),
  spacing: z.enum(["compact", "comfortable", "airy"]).optional(),
  corners: z.enum(["square", "rounded", "soft"]).optional(),
});
export type EventDesign = z.infer<typeof eventDesignSchema>;
export const defaultEventDesign: EventDesign = eventDesignSchema.parse({});
/** Applied only when creating event pages; copies and existing revisions keep their design. */
export function withDefaultEventDesign(data: CmsData): CmsData {
  return {
    ...data,
    root: {
      props: {
        ...data.root.props,
        eventLayout: "standalone",
        eventDesign: data.root.props.eventDesign ?? { ...defaultEventDesign },
      },
    },
  };
}
export const eventHiddenSectionsSchema = z
  .array(z.string().min(1).max(128))
  .max(120)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Select each hidden section once.",
  );

export const eventPalettes = {
  gala: {
    label: "Rotaract event",
    primary: "#8B4B00",
    background: "#F5EFE2",
    text: "#302C27",
  },
  ocean: {
    label: "Ocean",
    primary: "#175CD3",
    background: "#F4F7FC",
    text: "#172B4D",
  },
  warm: {
    label: "Warm",
    primary: "#B44929",
    background: "#FFF8EF",
    text: "#3C261B",
  },
  berry: {
    label: "Berry",
    primary: "#A22B70",
    background: "#FFF6FB",
    text: "#342135",
  },
} as const;

function buttonForeground(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 >
    0.179
    ? "#111111"
    : "#FFFFFF";
}

/** Event tokens are self-contained and stop at the event canvas/public root. */
export function eventDesignStyle(design: EventDesign): CSSProperties {
  const palette = eventPalettes[design.palette];
  const primary = design.primaryColor ?? palette.primary;
  const background = design.backgroundColor ?? palette.background;
  const text = design.textColor ?? palette.text;
  const font =
    design.font === "classic"
      ? 'Georgia, "Times New Roman", serif'
      : '"Segoe UI", Arial, sans-serif';
  return {
    "--paper": background,
    "--panel": design.backgroundColor
      ? `color-mix(in srgb, ${background} 95%, ${text})`
      : "#FFFFFF",
    "--ink": text,
    "--muted": `color-mix(in srgb, ${text} 72%, ${background})`,
    "--line": `color-mix(in srgb, ${text} 17%, ${background})`,
    "--club-accent": primary,
    "--accent": primary,
    "--kit-strong": primary,
    "--kit-highlight": primary,
    "--accent-foreground": buttonForeground(primary),
    "--cms-soft": `color-mix(in srgb, ${primary} 8%, ${background})`,
    "--cms-radius":
      design.corners === "square"
        ? "0px"
        : design.corners === "soft"
          ? "28px"
          : "16px",
    "--cms-cover-radius": "24px",
    "--cms-width": design.width === "focused" ? "880px" : "1200px",
    "--cms-block-gap":
      design.spacing === "compact"
        ? "32px"
        : design.spacing === "airy"
          ? "96px"
          : "64px",
    "--cms-font": font,
    "--serif": font,
    "--sans": font,
    fontFamily: font,
  } as CSSProperties;
}

/** Hiding is presentation only: immutable saved/public revision data remains intact. */
export function visibleEventContent(data: CmsData): CmsData {
  const hidden = new Set(data.root.props.eventHiddenSections ?? []);
  if (!hidden.size) return data;
  return {
    ...data,
    content: data.content
      .filter((block) => !hidden.has(block.props.id))
      .map((block) => {
        if (block.type === "Columns")
          return {
            ...block,
            props: {
              ...block.props,
              left: block.props.left.filter(
                (item) => !hidden.has(item.props.id),
              ),
              right: block.props.right.filter(
                (item) => !hidden.has(item.props.id),
              ),
            },
          };
        if (block.type === "SiteRow")
          return {
            ...block,
            props: {
              ...block.props,
              left: block.props.left.filter(
                (item) => !hidden.has(item.props.id),
              ),
              center: block.props.center.filter(
                (item) => !hidden.has(item.props.id),
              ),
              right: block.props.right.filter(
                (item) => !hidden.has(item.props.id),
              ),
            },
          };
        return block;
      }),
  };
}
