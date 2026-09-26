import { DomainError } from "@/core/DomainError";

function hasCode(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if ("type" in value && value.type === "CustomCode") return true;
  return Object.values(value).some(hasCode);
}

export function requireNonExecutableContent(value: unknown): void {
  if (hasCode(value))
    throw new DomainError(
      "AUTOMATION_CODE_DISABLED",
      "Custom HTML and JavaScript require editing in the website editor.",
      422,
    );
}
