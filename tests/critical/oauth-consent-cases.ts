import { describe, expect, it } from "vitest";
import type { RenewalContext } from "./oauth-renewal-cases";

/** Provider-owned consent, real OTP session and isolated PostgreSQL. */
export function oauthConsentChecks(context: () => RenewalContext) {
  describe("C14 reviewing the registered permissions from a narrower app request", () => {
    it("requires a separate visible review before wider grants reach tokens and AI context", async () => {
      const {
        connections,
        actor,
        headers,
        origin,
        resource,
        protocol,
        authorize,
        exchange,
        access,
      } = context();
      const callback = `${origin}/synthetic-review-callback`;
      const scopes = [
        "website:read",
        "website:write",
        "website:publish",
        "sources:read",
      ];
      const client = await connections.create(actor, headers, {
        name: "Synthetic permission review",
        redirectUris: [callback],
        scopes,
        sourceOrigins: ["https://www.rotary.org"],
      });
      const flow = await authorize(client.clientId, callback, "website:read");
      const original = new URLSearchParams(flow.signed);
      const input = { oauth_query: flow.signed, expectedRevision: "initial" };
      const details = await connections.details(actor, headers, flow.signed);
      expect(details.scopes).toEqual(["website:read", "offline_access"]);
      expect(details.allowedScopes).toEqual([...scopes, "offline_access"]);
      await expect(
        connections.consent(actor, headers, { ...input, accept: true, scopes }),
      ).rejects.toMatchObject({ code: "OAUTH_SCOPE_INVALID" });
      await expect(
        connections.reviewPermissions(actor, headers, {
          ...input,
          expectedRevision: "stale",
        }),
      ).rejects.toMatchObject({ code: "OAUTH_PERMISSIONS_CHANGED" });
      await expect(
        connections.reviewPermissions(
          { ...actor, userId: "another-user" },
          headers,
          input,
        ),
      ).rejects.toMatchObject({ status: 403 });
      const forged = new URLSearchParams(flow.signed);
      forged.set("redirect_uri", "https://attacker.example/callback");
      await expect(
        connections.reviewPermissions(actor, headers, {
          ...input,
          oauth_query: forged.toString(),
        }),
      ).rejects.toThrow();
      const review = await connections.reviewPermissions(actor, headers, input);
      const url = new URL(review.url);
      expect(url.origin + url.pathname).toBe(
        `${origin}/api/auth/oauth2/authorize`,
      );
      for (const key of [
        "client_id",
        "redirect_uri",
        "resource",
        "state",
        "code_challenge",
        "code_challenge_method",
        "response_type",
      ])
        expect(url.searchParams.get(key) === original.get(key), key).toBe(true);
      expect(url.searchParams.get("scope")?.split(" ")).toEqual([
        ...scopes,
        "offline_access",
      ]);
      expect(url.searchParams.get("prompt")).toBe("consent");
      expect({
        unique: [...url.searchParams.keys()].every(
          (key) => url.searchParams.getAll(key).length === 1,
        ),
        resource:
          url.searchParams.getAll("resource").length === 1 &&
          url.searchParams.get("resource") === resource,
        responseType: url.searchParams.get("response_type") === "code",
        pkce:
          url.searchParams.get("code_challenge_method") === "S256" &&
          /^[A-Za-z0-9_-]{43}$/.test(
            url.searchParams.get("code_challenge") ?? "",
          ),
        state: Boolean(url.searchParams.get("state")),
      }).toEqual({
        unique: true,
        resource: true,
        responseType: true,
        pkce: true,
        state: true,
      });
      expect(
        (await connections.list(actor)).find(
          (item) => item.clientId === client.clientId,
        )?.approvedScopes,
      ).toEqual(["website:read"]);
      const response = await protocol(
        new Request(review.url, {
          headers: new Headers([...headers, ["accept", "text/html"]]),
        }),
      );
      expect(response.status).toBe(302);
      const consent = new URL(response.headers.get("location")!, origin);
      expect(consent.pathname).toBe("/oauth/consent");
      const signed = consent.searchParams.toString();
      expect(
        (await connections.details(actor, headers, signed)).scopes,
      ).toEqual([...scopes, "offline_access"]);
      const approval = {
        oauth_query: signed,
        accept: true,
        scopes: [...scopes, "offline_access"],
      };
      await expect(
        connections.consent(
          { ...actor, authenticatedAt: new Date(Date.now() - 13 * 3600_000) },
          headers,
          approval,
        ),
      ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
      await expect(
        connections.consent(
          { ...actor, sessionContextChanged: true },
          headers,
          approval,
        ),
      ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
      const result = await connections.consent(
        { ...actor, authenticatedAt: new Date(Date.now() - 2 * 3600_000) },
        headers,
        approval,
      );
      const returned = new URL(result.url);
      expect(returned.searchParams.get("state") === original.get("state")).toBe(
        true,
      );
      const issued = await exchange({
        grant_type: "authorization_code",
        client_id: client.clientId,
        client_secret: client.clientSecret!,
        redirect_uri: callback,
        resource,
        code: returned.searchParams.get("code")!,
        code_verifier: flow.verifier,
      });
      expect(issued.status).toBe(200);
      const token = (await issued.json()) as {
        access_token: string;
        scope: string;
      };
      expect(token.scope.split(" ")).toEqual([...scopes, "offline_access"]);
      expect((await access.authenticate(token.access_token)).scopes).toEqual(
        scopes,
      );
      await expect(
        connections.consent(
          { ...actor, sessionContextChanged: true },
          headers,
          approval,
        ),
      ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
      const { automationContext } =
        await import("../../src/composition/automation");
      const { executeOperation } =
        await import("../../src/integrations/automation/catalogue");
      const current = await automationContext(
        new Request(resource, {
          headers: { authorization: `Bearer ${token.access_token}` },
        }),
        "mcp",
      );
      expect(
        await executeOperation(current, "automation_capabilities", {}),
      ).toMatchObject({
        grantedScopes: scopes,
        accessMode: "read-write",
        publication: "on-request",
        permissions: expect.arrayContaining([
          { scope: "website:write", label: "Create and edit website drafts" },
        ]),
        sourceOrigins: ["https://www.rotary.org"],
      });
      const { POST } =
        await import("../../src/app/api/automation/oauth/review/route");
      const request = (originHeader: string, cookie = headers.get("cookie")!) =>
        new Request(`${origin}/api/automation/oauth/review`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: originHeader,
            cookie,
          },
          body: JSON.stringify(input),
        });
      expect((await POST(request("https://attacker.example"))).status).toBe(
        403,
      );
      expect((await POST(request(origin, ""))).status).toBe(401);
      await connections.revoke(actor, headers, client.clientId);
      await expect(
        connections.reviewPermissions(actor, headers, input),
      ).rejects.toMatchObject({ code: "OAUTH_CLIENT_UNAVAILABLE" });
    });

    it("applies the workday policy to the real browser session and detects browser changes", async () => {
      const { pool, actor, headers, connections, authorize, origin, protocol } =
        context();
      const callback = `${origin}/synthetic-context-callback`;
      const client = await connections.create(actor, headers, {
        name: "Synthetic session context",
        redirectUris: [callback],
        scopes: ["website:read"],
        sourceOrigins: [],
      });
      const flow = await authorize(client.clientId, callback);
      const original = new URLSearchParams(flow.signed);
      const authorization = new URLSearchParams();
      for (const key of [
        "client_id",
        "redirect_uri",
        "scope",
        "resource",
        "state",
        "response_type",
        "code_challenge",
        "code_challenge_method",
      ])
        authorization.set(key, original.get(key)!);
      const snapshot = await pool.query(
        "SELECT created_at, user_agent FROM club.session WHERE id=$1",
        [actor.sessionId],
      );
      const { getActor } = await import("../../src/core/auth/actor");
      const { requireRecentActor } =
        await import("../../src/core/authorization/AuthorizationService");
      const browserHeaders = new Headers(headers);
      browserHeaders.set("user-agent", "Synthetic stable browser");
      try {
        await pool.query(
          "UPDATE club.session SET created_at=NOW()-INTERVAL '2 hours',user_agent=$2 WHERE id=$1",
          [actor.sessionId, "Synthetic stable browser"],
        );
        const current = await getActor(browserHeaders);
        expect(current?.sessionContextChanged).toBe(false);
        expect(() => requireRecentActor(current!)).not.toThrow();
        browserHeaders.set("user-agent", "Synthetic changed browser");
        const changed = await getActor(browserHeaders);
        expect(changed?.sessionContextChanged).toBe(true);
        expect(() => requireRecentActor(changed!)).toThrow(
          expect.objectContaining({ code: "RECENT_AUTH_REQUIRED" }),
        );
        // Even remembered consent must return to identity confirmation on this browser.
        const response = await protocol(
          new Request(`${origin}/api/auth/oauth2/authorize?${authorization}`, {
            headers: new Headers([...browserHeaders, ["accept", "text/html"]]),
          }),
        );
        expect(response.status).toBe(302);
        expect(
          new URL(response.headers.get("location")!, origin).pathname,
        ).toBe("/api/automation/oauth/sign-in");
      } finally {
        await pool.query(
          "UPDATE club.session SET created_at=$2,user_agent=$3 WHERE id=$1",
          [
            actor.sessionId,
            snapshot.rows[0].created_at,
            snapshot.rows[0].user_agent,
          ],
        );
        await connections.revoke(actor, headers, client.clientId);
      }
    });
  });
}
