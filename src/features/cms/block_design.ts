import { z } from "zod";

const presentation = {
  textSize: z.enum(["small", "regular", "large", "display"]).optional(),
  lineHeight: z.enum(["compact", "normal", "relaxed"]).optional(),
  imageFit: z.enum(["cover", "contain"]).optional(),
  imageRatio: z
    .enum(["original", "square", "landscape", "portrait", "wide"])
    .optional(),
  imagePosition: z
    .enum(["center", "top", "bottom", "left", "right"])
    .optional(),
};
const responsiveDesignSchema = z.strictObject({
  ...presentation,
  spacing: z.enum(["compact", "comfortable", "spacious"]).optional(),
  width: z.enum(["full", "reading"]).optional(),
  alignment: z.enum(["left", "center", "right"]).optional(),
  columns: z.enum(["one", "two", "three", "four"]).optional(),
});

/** Optional semantic overrides. Missing values continue to inherit the website theme. */
export const blockDesignSchema = z.strictObject({
  ...presentation,
  tone: z.enum(["paper", "soft", "dark"]).optional(),
  spacing: z.enum(["compact", "comfortable", "spacious"]).optional(),
  width: z.enum(["full", "reading", "viewport"]).optional(),
  alignment: z.enum(["left", "center", "right"]).optional(),
  corners: z.enum(["square", "soft"]).optional(),
  columns: z.enum(["two", "three", "four"]).optional(),
  responsive: z
    .strictObject({
      tablet: responsiveDesignSchema.optional(),
      mobile: responsiveDesignSchema.optional(),
    })
    .optional(),
});
export type BlockDesign = z.infer<typeof blockDesignSchema>;
export const designOptions = {
  tone: {
    label: "Section background",
    choices: { paper: "Paper", soft: "Soft", dark: "Dark" },
  },
  spacing: {
    label: "Section spacing",
    choices: {
      compact: "Compact",
      comfortable: "Comfortable",
      spacious: "Spacious",
    },
  },
  width: {
    label: "Content width",
    choices: {
      full: "Full section",
      reading: "Reading width",
      viewport: "Website width",
    },
  },
  alignment: {
    label: "Text alignment",
    choices: { left: "Left", center: "Center", right: "Right" },
  },
  corners: {
    label: "Section corners",
    choices: { square: "Square", soft: "Soft" },
  },
  columns: {
    label: "Grid columns",
    choices: { two: "Two", three: "Three", four: "Four" },
  },
  textSize: {
    label: "Text size",
    choices: {
      small: "Small · 16 px",
      regular: "Regular · 20 px",
      large: "Large · 28 px",
      display: "Display · 40 px",
    },
  },
  lineHeight: {
    label: "Line spacing",
    choices: {
      compact: "Compact · 1.2",
      normal: "Normal · 1.5",
      relaxed: "Relaxed · 1.8",
    },
  },
  imageFit: {
    label: "Image fit",
    choices: { cover: "Fill the frame", contain: "Show the entire image" },
  },
  imageRatio: {
    label: "Image shape",
    choices: {
      original: "Original",
      square: "Square",
      landscape: "Landscape",
      portrait: "Portrait",
      wide: "Wide",
    },
  },
  imagePosition: {
    label: "Image focus",
    choices: {
      center: "Center",
      top: "Top",
      bottom: "Bottom",
      left: "Left",
      right: "Right",
    },
  },
} as const;

export type DesignOption = keyof typeof designOptions;
export function inheritedDesignValue(
  design: BlockDesign,
  breakpoint: "tablet" | "mobile",
  key: DesignOption,
) {
  const tablet =
    breakpoint === "mobile"
      ? Reflect.get(design.responsive?.tablet ?? {}, key)
      : undefined;
  const base = Reflect.get(design, key);
  return {
    value: tablet ?? base,
    source: tablet !== undefined ? "Tablet" : "All screens",
  };
}
