import { z } from "zod";
import type { CSSProperties } from "react";

// Trusted built-in presentation only. Blocks and event features have separate schemas.
export const themeIdSchema = z.enum([
  "default",
  "minimal",
  "rotary-service",
  "rotaract-action",
]);
export const appearanceSchema = z.strictObject({
  themeId: themeIdSchema.default("default"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  font: z.enum(["sans", "serif"]).nullable(),
});
export type Appearance = z.infer<typeof appearanceSchema>;

export const websiteThemes = {
  "rotary-service": {
    name: "Rotary Template",
    description:
      "Photography, editorial layouts, blue accents and a restrained shared header and footer.",
    paper: "#ffffff",
    panel: "#ffffff",
    ink: "#172b46",
    muted: "#526174",
    line: "#dce3ec",
    accent: "#0067C8",
    font: "sans",
    soft: "#f2f5f8",
    radius: "0px",
    coverRadius: "0px",
    width: "1200px",
    blockGap: "64px",
  },
  "rotaract-action": {
    name: "Rotaract Template",
    description:
      "Asymmetric stories, bold cranberry accents and invitations to take part.",
    paper: "#ffffff",
    panel: "#ffffff",
    ink: "#25252b",
    muted: "#5e5e68",
    line: "#e5e1e4",
    accent: "#D41367",
    font: "sans",
    soft: "#f7f5f6",
    radius: "12px",
    coverRadius: "12px",
    width: "1200px",
    blockGap: "64px",
  },
  default: {
    name: "Community",
    description:
      "The existing warm design with generous spacing and soft surfaces.",
    paper: "#f8f6f0",
    panel: "#fffefb",
    ink: "#24362c",
    muted: "#667268",
    line: "#dfe3d9",
    accent: "#25636b",
    font: "sans",
    soft: "#e8ecdf",
    radius: "8px",
    coverRadius: "12px",
    width: "1240px",
    blockGap: "40px",
  },
  minimal: {
    name: "Minimal",
    description:
      "White surfaces, compact spacing and square details. The same content blocks.",
    paper: "#ffffff",
    panel: "#f5f6f7",
    ink: "#202a35",
    muted: "#556170",
    line: "#dce0e5",
    accent: "#254d7c",
    font: "sans",
    soft: "#edf1f6",
    radius: "2px",
    coverRadius: "2px",
    width: "1080px",
    blockGap: "28px",
  },
} as const;

export function appearanceOf(settings: Appearance): Appearance {
  return appearanceSchema.parse({
    themeId: settings.themeId,
    accentColor: settings.accentColor,
    font: settings.font,
  });
}

function contrast(hex: string): string {
  const values = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  const luminance =
    values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  return luminance > 0.179 ? "#111111" : "#ffffff";
}

/** Applied only to the public/preview root, never document.body or administration. */
export function websiteStyle(appearance: Appearance): CSSProperties {
  const theme = websiteThemes[appearance.themeId];
  const accent = appearance.accentColor ?? theme.accent;
  return {
    "--paper": theme.paper,
    "--panel": theme.panel,
    "--ink": theme.ink,
    "--muted": theme.muted,
    "--line": theme.line,
    "--club-accent": accent,
    "--kit-strong":
      appearance.themeId === "rotary-service" ? "#17458F" : accent,
    "--kit-highlight":
      appearance.themeId === "rotary-service" ? "#F7A81B" : accent,
    "--accent-foreground": contrast(accent),
    "--cms-soft": theme.soft,
    "--cms-radius": theme.radius,
    "--cms-width": theme.width,
    "--cms-cover-radius": theme.coverRadius,
    "--cms-block-gap": theme.blockGap,
    "--cms-font":
      (appearance.font ?? theme.font) === "serif"
        ? "Georgia, serif"
        : appearance.themeId === "rotary-service" ||
            appearance.themeId === "rotaract-action"
          ? "Arial, sans-serif"
          : '"Segoe UI", Arial, sans-serif',
  } as CSSProperties;
}
