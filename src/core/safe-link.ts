export function isSafeLink(value: string): boolean {
  if (!value) return true;
  if (
    /[\\\s]/u.test(value) ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  if (value.startsWith("#")) return /^#[A-Za-z][A-Za-z0-9_.:%-]*$/u.test(value);
  try {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
