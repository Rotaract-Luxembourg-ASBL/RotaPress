import { NextResponse, type NextRequest } from "next/server";
import { permittedBrowserOrigin } from "./core/origin-policy";

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  // Provider callbacks and server webhooks retain their own state/signature checks.
  // A missing Origin on ordinary GETs does not prove identity; route authorization still applies.
  const provider =
    request.nextUrl.pathname === "/api/auth/callback/google" ||
    request.nextUrl.pathname.startsWith("/api/webhooks/");
  if (
    !provider &&
    ((origin && !permittedBrowserOrigin(origin, process.env.APP_URL ?? "")) ||
      request.headers.get("sec-fetch-site") === "cross-site")
  ) {
    return NextResponse.json(
      { error: "Cross-origin access is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store", Vary: "Origin" } },
    );
  }
  if (request.method === "OPTIONS" && !provider) {
    if (!permittedBrowserOrigin(origin, process.env.APP_URL ?? ""))
      return new NextResponse(null, { status: 403 });
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store", Vary: "Origin" },
    });
  }
  return NextResponse.next();
}
export const config = { matcher: ["/api/:path*"] };
