import { z } from "zod";

export const captionLanguageSchema = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .refine((language) => {
    try {
      return Intl.getCanonicalLocales(language).length === 1;
    } catch {
      return false;
    }
  }, "Use a language tag such as en, fr or lb.");

const captionCueSchema = z
  .strictObject({
    start: z.number().min(0).max(86_400),
    end: z.number().min(0).max(86_400),
    text: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .refine(
        (value) =>
          [...value].every((character) => {
            const code = character.charCodeAt(0);
            return (
              code === 9 ||
              code === 10 ||
              code === 13 ||
              (code >= 32 && code !== 127)
            );
          }),
        "Remove unsupported control characters from the caption.",
      ),
  })
  .refine((cue) => Math.round(cue.end * 1000) > Math.round(cue.start * 1000), {
    message: "End must be at least one millisecond after start.",
    path: ["end"],
  });

export const videoCaptionCuesSchema = z
  .array(captionCueSchema)
  .max(500)
  .superRefine((cues, context) => {
    for (let index = 1; index < cues.length; index += 1) {
      if (
        Math.round(cues[index].start * 1000) <
        Math.round(cues[index - 1].end * 1000)
      )
        context.addIssue({
          code: "custom",
          message: "Keep captions in time order without overlapping intervals.",
          path: [index, "start"],
        });
    }
    if (cues.reduce((length, cue) => length + cue.text.length, 0) > 50_000)
      context.addIssue({
        code: "custom",
        message: "Use at most 50,000 characters across the caption track.",
      });
  });

function timestamp(seconds: number) {
  const total = Math.round(seconds * 1000);
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const remainder = Math.floor((total % 60_000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}.${String(total % 1000).padStart(3, "0")}`;
}

/** Plain text only: cue text cannot introduce VTT markup, settings or new cues. */
function captionText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n\s*\n/g, "\n")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** The editor may hold incomplete fields; only a valid track reaches playback. */
export function videoCaptionsVtt(input: unknown): string | null {
  const parsed = videoCaptionCuesSchema.safeParse(input);
  if (!parsed.success || parsed.data.length === 0) return null;
  return `WEBVTT\n\n${parsed.data
    .map(
      (cue, index) =>
        `${index + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${captionText(cue.text)}`,
    )
    .join("\n\n")}\n`;
}
