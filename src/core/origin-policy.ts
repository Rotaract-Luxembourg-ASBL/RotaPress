/** CORS does not replace authorization; this is a browser transport boundary. */
export function permittedBrowserOrigin(
  origin: string | null,
  configuredUrl: string,
): boolean {
  if (!origin || origin === "null") return false;
  try {
    return origin === new URL(configuredUrl).origin;
  } catch {
    return false;
  }
}
