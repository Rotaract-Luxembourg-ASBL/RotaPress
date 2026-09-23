import { z } from "zod";

/** Optional semantic overrides. Missing values continue to inherit the website theme. */
export const blockDesignSchema = z.strictObject({
  tone: z.enum(["paper", "soft", "dark"]).optional(),
  spacing: z.enum(["compact", "comfortable", "spacious"]).optional(),
  width: z.enum(["full", "reading"]).optional(),
  alignment: z.enum(["left", "center", "right"]).optional(),
  corners: z.enum(["square", "soft"]).optional(),
  columns: z.enum(["two", "three", "four"]).optional(),
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
    choices: { full: "Full section", reading: "Reading width" },
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
    label: "Columns on desktop",
    choices: { two: "Two", three: "Three", four: "Four" },
  },
} as const;
