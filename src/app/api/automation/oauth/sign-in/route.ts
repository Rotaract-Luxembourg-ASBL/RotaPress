import { NextResponse } from "next/server";
import { auth } from "@/core/auth/server";
import { config } from "@/core/config";
import { handle } from "@/core/http";
import {
  encodePendingOAuth,
  pendingOAuthCookie,
} from "@/integrations/automation/oauth/pending";

export function GET(request: Request) {
  return handle(async () => {
    const query = new URL(request.url).searchParams.toString();
    // The provider verifies its own signed, expiring request before we retain it.
    await auth.api.readAutomationOAuthRequest({ body: { oauth_query: query } });
    const response = NextResponse.redirect(
      new URL(
        "/sign-in?reauth=1&next=/admin/integrations/automation/authorize",
        config.APP_URL,
      ),
    );
    response.cookies.set(pendingOAuthCookie, encodePendingOAuth(query), {
      httpOnly: true,
      secure: new URL(config.APP_URL).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    response.headers.set("Cache-Control", "no-store, private");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  });
}
