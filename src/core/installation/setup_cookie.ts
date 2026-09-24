const cookieName = "rotapress_setup";

export function readSetupClaim(headers: Headers): string {
  const value =
    headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : "";
}

export function setupCookie(claim: string, secure: boolean): string {
  return `${cookieName}=${claim}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${claim ? 3600 : 0}${secure ? "; Secure" : ""}`;
}
