import { NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { auth } from "@/core/auth/server";
import { config } from "@/core/config";
import { handle } from "@/core/http";
import {
  encodePendingOAuth,
  pendingOAuthCookie,
} from "@/integrations/automation/oauth/pending";
import { oauthErrorPath } from "@/integrations/automation/oauth/errors";

function unavailableRequest() {
  const response = NextResponse.redirect(
    new URL(oauthErrorPath("invalid_request"), config.APP_URL),
  );
  response.cookies.delete(pendingOAuthCookie);
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function GET(request: Request) {
  return handle(async () => {
    const query = new URL(request.url).searchParams.toString();
    if (!query || query.length > 6000) return unavailableRequest();
    // The provider verifies its own signed, expiring request before we retain it.
    try {
      const verified = await auth.api.readAutomationOAuthRequest({
        body: { oauth_query: query },
      });
      if (!verified.query) return unavailableRequest();
    } catch (error) {
      if (
        error instanceof APIError &&
        error.statusCode >= 400 &&
        error.statusCode < 500
      )
        return unavailableRequest();
      throw error;
    }
    let pending: string;
    try {
      pending = encodePendingOAuth(query);
    } catch {
      return unavailableRequest();
    }
    const response = NextResponse.redirect(
      new URL("/sign-in?reauth=1&next=/oauth/continue", config.APP_URL),
    );
    response.cookies.set(pendingOAuthCookie, pending, {
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
