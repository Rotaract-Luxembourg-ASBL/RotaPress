import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../../src/proxy";

const club = "https://club.example.test";
const navigation = {
  "sec-fetch-site": "cross-site",
  "sec-fetch-mode": "navigate",
  "sec-fetch-dest": "document",
};

describe("C14 OAuth browser navigation boundary", () => {
  it("passes external OAuth navigation and its signed sign-in handoff to route validation", () => {
    for (const path of [
      "/api/auth/oauth2/authorize",
      "/api/automation/oauth/sign-in",
    ]) {
      const response = proxy(
        new NextRequest(`${club}${path}`, { headers: navigation }),
      );
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("keeps cross-site fetches, frames, preflight, mutations and other API routes blocked", () => {
    for (const [path, method, mode, destination] of [
      ["/api/auth/oauth2/authorize", "GET", "cors", "empty"],
      ["/api/auth/oauth2/authorize", "GET", "navigate", "iframe"],
      ["/api/auth/oauth2/authorize", "GET", "", ""],
      ["/api/auth/oauth2/authorize", "POST", "navigate", "document"],
      ["/api/auth/oauth2/authorize", "OPTIONS", "cors", "empty"],
      ["/api/automation/oauth/sign-in", "GET", "cors", "empty"],
      ["/api/auth/get-session", "GET", "navigate", "document"],
      [
        "/api/admin/integrations/automation/oauth",
        "POST",
        "navigate",
        "document",
      ],
      ["/api/auth/oauth2/token", "POST", "navigate", "document"],
      ["/api/auth/oauth2/revoke", "POST", "navigate", "document"],
      ["/api/mcp", "GET", "navigate", "document"],
    ]) {
      const response = proxy(
        new NextRequest(`${club}${path}`, {
          method,
          headers: {
            ...navigation,
            "sec-fetch-mode": mode,
            "sec-fetch-dest": destination,
          },
        }),
      );
      expect(response.status, `${method} ${path} ${mode}/${destination}`).toBe(
        403,
      );
    }
  });
});
