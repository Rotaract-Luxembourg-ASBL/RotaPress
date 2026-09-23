/** Shared element semantics; layout elements never become submitted answers. */
export const MAX_FORM_ELEMENTS = 60;
export const isContentElement = (type: string) =>
  type === "heading" || type === "page_break";
export const hasOptions = (type: string) =>
  ["choice", "radio", "multiselect"].includes(type);
export type AnswerValue = string | boolean | string[];
export function answerText(value: AnswerValue | undefined): string {
  return Array.isArray(value)
    ? value.join("; ")
    : typeof value === "boolean"
      ? value
        ? "Yes"
        : "No"
      : (value ?? "");
}
