import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { TrustedActor } from "../../src/core/authorization/AuthorizationService";
import type { OAuthAccess } from "../../src/integrations/automation/oauth/OAuthAccess";
import type { OAuthConnections } from "../../src/integrations/automation/oauth/OAuthConnections";

type RenewalContext = {
  pool: Pool;
  connections: OAuthConnections;
  access: OAuthAccess;
  actor: TrustedActor;
  headers: Headers;
  origin: string;
  resource: string;
  protocol: (request: Request) => Promise<Response>;
  authorize: (
    clientId: string,
    callback: string,
    scopes?: string | null,
  ) => Promise<{
    code: string;
    verifier: string;
    signed: string;
  }>;
  exchange: (input: Record<string, string>) => Promise<Response>;
};

/** Shares the provider suite's real OTP session and disposable PostgreSQL fixture. */
export function oauthRenewalChecks(context: () => RenewalContext) {
  describe("C14 OAuth renewal and remembered permission boundaries", () => {
    it("remembers unchanged consent beyond eight hours but requires recent sign-in for new access", async () => {
      const {
        pool,
        connections,
        access,
        actor,
        headers,
        origin,
        resource,
        protocol,
        authorize,
        exchange,
      } = context();
      const callback = `${origin}/synthetic-renewal-callback`;
      const client = await connections.create(actor, headers, {
        name: "Synthetic remembered connection",
        redirectUris: [callback],
        scopes: ["website:read", "website:write"],
        sourceOrigins: [],
      });
      const session = await pool.query(
        "SELECT created_at FROM club.session WHERE id=$1",
        [actor.sessionId],
      );
      const tokenRequest = (code: string, verifier: string) =>
        exchange({
          grant_type: "authorization_code",
          client_id: client.clientId,
          client_secret: client.clientSecret!,
          redirect_uri: callback,
          resource,
          code,
          code_verifier: verifier,
        });
      const request = async (scope: string, prompt?: string) => {
        const verifier = randomBytes(32).toString("base64url");
        const state = randomBytes(24).toString("base64url");
        const params = new URLSearchParams({
          client_id: client.clientId,
          redirect_uri: callback,
          resource,
          scope,
          state,
          response_type: "code",
          code_challenge_method: "S256",
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
          ...(prompt ? { prompt } : {}),
        });
        const response = await protocol(
          new Request(`${origin}/api/auth/oauth2/authorize?${params}`, {
            headers: new Headers([...headers, ["accept", "text/html"]]),
          }),
        );
        expect(response.status).toBe(302);
        return {
          returned: new URL(response.headers.get("location")!, origin),
          verifier,
          state,
        };
      };
      try {
        const flow = await authorize(client.clientId, callback);
        const issued = await tokenRequest(flow.code, flow.verifier);
        expect(issued.status).toBe(200);
        const token = (await issued.json()) as {
          access_token: string;
          refresh_token: string;
        };
        expect(Boolean(token.refresh_token)).toBe(true);
        const refresh = await pool.query(
          "SELECT EXTRACT(EPOCH FROM (expires_at-created_at))::integer AS lifetime FROM club.oauth_refresh_token WHERE client_id=$1",
          [client.clientId],
        );
        expect(refresh.rows[0].lifetime).toBe(7 * 24 * 60 * 60);
        const consent = await pool.query(
          "UPDATE club.oauth_consent SET updated_at=date_trunc('second',NOW()-INTERVAL '9 hours') WHERE client_id=$1 RETURNING updated_at",
          [client.clientId],
        );
        await pool.query(
          "UPDATE club.session SET created_at=NOW()-INTERVAL '9 hours' WHERE id=$1",
          [actor.sessionId],
        );
        const { getActor } = await import("../../src/core/auth/actor");
        const agedActor = await getActor(headers);
        expect(agedActor).not.toBeNull();
        if (!agedActor)
          throw new Error("The real staff session must remain active.");
        expect((await access.authenticate(token.access_token)).scopes).toEqual([
          "website:read",
        ]);

        const remembered = await request("website:read");
        expect(remembered.returned.origin + remembered.returned.pathname).toBe(
          callback,
        );
        expect(
          remembered.returned.searchParams.get("state") === remembered.state,
        ).toBe(true);
        expect(remembered.returned.searchParams.get("error")).toBeNull();
        const exchanged = await tokenRequest(
          remembered.returned.searchParams.get("code")!,
          remembered.verifier,
        );
        expect(exchanged.status).toBe(200);
        const unchanged = await pool.query(
          "SELECT updated_at FROM club.oauth_consent WHERE client_id=$1",
          [client.clientId],
        );
        expect(unchanged.rows[0].updated_at).toEqual(
          consent.rows[0].updated_at,
        );
        expect((await access.authenticate(token.access_token)).scopes).toEqual([
          "website:read",
        ]);

        const review = await request("website:read", "consent");
        expect(review.returned.pathname).toBe("/oauth/consent");
        const query = review.returned.searchParams.toString();
        expect(
          await connections.details(agedActor, headers, query),
        ).toMatchObject({
          recentlyAuthenticated: false,
          approvedScopes: ["website:read", "offline_access"],
        });
        const same = await connections.consent(agedActor, headers, {
          oauth_query: query,
          accept: true,
          scopes: ["website:read", "offline_access"],
        });
        expect(new URL(same.url).searchParams.has("code")).toBe(true);

        const wider = await request("website:read website:write");
        expect(wider.returned.pathname).toBe("/oauth/consent");
        const input = {
          oauth_query: wider.returned.searchParams.toString(),
          accept: true,
        };
        await expect(
          connections.consent(agedActor, headers, {
            ...input,
            scopes: ["website:read", "website:write", "offline_access"],
          }),
        ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
        // The user may decline the new action without being forced to log in again.
        const narrower = await connections.consent(agedActor, headers, {
          ...input,
          scopes: ["website:read", "offline_access"],
        });
        const response = await tokenRequest(
          new URL(narrower.url).searchParams.get("code")!,
          wider.verifier,
        );
        expect(response.status).toBe(200);
        const narrowed = (await response.json()) as { access_token: string };
        expect(
          (await access.authenticate(narrowed.access_token)).scopes,
        ).toEqual(["website:read"]);
      } finally {
        await pool.query("UPDATE club.session SET created_at=$2 WHERE id=$1", [
          actor.sessionId,
          session.rows[0].created_at,
        ]);
        await connections.revoke(actor, headers, client.clientId);
      }
    });

    it("does not restore permissions narrowed after the initial consent read", async () => {
      const { pool, connections, actor, headers, origin, authorize } =
        context();
      const callback = `${origin}/synthetic-consent-race-callback`;
      const client = await connections.create(actor, headers, {
        name: "Synthetic concurrent consent",
        redirectUris: [callback],
        scopes: ["website:read", "website:write"],
        sourceOrigins: [],
      });
      const session = await pool.query(
        "SELECT created_at FROM club.session WHERE id=$1",
        [actor.sessionId],
      );
      const { services } = await import("../../src/composition/services");
      const consume = services.limiter.consume.bind(services.limiter);
      const narrowing = vi.spyOn(services.limiter, "consume");
      const broadScopes = ["website:read", "website:write", "offline_access"];
      const narrowScopes = ["website:read", "offline_access"];
      try {
        const flow = await authorize(
          client.clientId,
          callback,
          broadScopes.join(" "),
        );
        await pool.query(
          "UPDATE club.session SET created_at=NOW()-INTERVAL '1 hour' WHERE id=$1",
          [actor.sessionId],
        );
        const { getActor } = await import("../../src/core/auth/actor");
        const agedActor = await getActor(headers);
        expect(agedActor).not.toBeNull();
        if (!agedActor)
          throw new Error("The real staff session must remain active.");
        expect(
          await connections.details(agedActor, headers, flow.signed),
        ).toMatchObject({
          recentlyAuthenticated: false,
          approvedScopes: broadScopes,
        });
        narrowing.mockClear().mockImplementationOnce(async (...args) => {
          expect(args[0]).toBe("oauth-consent");
          // Another tab commits a narrower approval after details was read.
          const changed = await pool.query(
            "UPDATE club.oauth_consent SET scopes=$2,updated_at=date_trunc('second',NOW()) WHERE client_id=$1 AND user_id=$3",
            [client.clientId, narrowScopes, actor.userId],
          );
          expect(changed.rowCount).toBe(1);
          await consume(...args);
        });
        await expect(
          connections.consent(agedActor, headers, {
            oauth_query: flow.signed,
            accept: true,
            scopes: broadScopes,
          }),
        ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
        expect(narrowing).toHaveBeenCalledOnce();
        const saved = await pool.query(
          "SELECT scopes FROM club.oauth_consent WHERE client_id=$1 AND user_id=$2",
          [client.clientId, actor.userId],
        );
        expect(saved.rows[0].scopes).toEqual(narrowScopes);
      } finally {
        narrowing.mockRestore();
        await pool.query("UPDATE club.session SET created_at=$2 WHERE id=$1", [
          actor.sessionId,
          session.rows[0].created_at,
        ]);
        await connections.revoke(actor, headers, client.clientId);
      }
    });
  });
}
