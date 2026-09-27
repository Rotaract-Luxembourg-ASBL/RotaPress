import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RenewalContext } from "./oauth-renewal-cases";

export function oauthConnectionChecks(context: () => RenewalContext) {
  describe("C14 existing OAuth connection management", () => {
    it("saves permissions on the same client, invalidates grants, requires new consent and keeps private activity scoped", async () => {
      const {
        pool,
        connections,
        access,
        actor,
        headers,
        origin,
        resource,
        authorize,
        exchange,
      } = context();
      const callback = `${origin}/synthetic-managed-callback`;
      const client = await connections.create(actor, headers, {
        name: "Synthetic managed assistant",
        redirectUris: [callback],
        scopes: ["website:read", "website:write", "sources:read"],
        sourceOrigins: ["https://www.example.org"],
      });
      const tokenRequest = async (scopes: string) => {
        const flow = await authorize(client.clientId, callback, scopes);
        const response = await exchange({
          grant_type: "authorization_code",
          client_id: client.clientId,
          client_secret: client.clientSecret!,
          redirect_uri: callback,
          resource,
          code: flow.code,
          code_verifier: flow.verifier,
        });
        expect(response.status).toBe(200);
        return (await response.json()) as {
          access_token: string;
          refresh_token: string;
        };
      };
      const tokens = await tokenRequest(
        "website:read website:write sources:read offline_access",
      );
      const refreshInput = {
        grant_type: "refresh_token",
        client_id: client.clientId,
        client_secret: client.clientSecret!,
        resource,
        refresh_token: tokens.refresh_token,
      };
      const refreshResponse = await exchange(refreshInput);
      expect(refreshResponse.status).toBe(200);
      const renewed = (await refreshResponse.json()) as typeof tokens;
      const { automationContext } =
        await import("../../src/composition/automation");
      const { executeOperation } =
        await import("../../src/integrations/automation/catalogue");
      const current = await automationContext(
        new Request(resource, {
          headers: { authorization: `Bearer ${renewed.access_token}` },
        }),
        "mcp",
      );
      await executeOperation(current, "automation_capabilities", {});
      await expect(
        executeOperation(current, "calendar_create", {
          privatePayload: "NEVER RECORD INPUT",
        }),
      ).rejects.toMatchObject({ status: 403 });
      const before = (await connections.list(actor)).find(
        (item) => item.clientId === client.clientId,
      )!;
      expect(before.approvedScopes).toEqual(
        expect.arrayContaining(["website:read", "website:write"]),
      );
      expect(before.lastUsedAt).not.toBeNull();
      const input = {
        clientId: client.clientId,
        expectedRevision: before.permissionsRevision,
        scopes: ["website:read", "sources:read"],
        sourceOrigins: ["https://new.example.org"],
      };
      await expect(
        connections.updatePermissions(
          { ...actor, authenticatedAt: new Date(Date.now() - 16 * 60000) },
          input,
        ),
      ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
      await expect(
        connections.updatePermissions(actor, {
          ...input,
          scopes: ["sources:read"],
          sourceOrigins: [],
        }),
      ).rejects.toMatchObject({ code: "SOURCE_ORIGIN_REQUIRED" });
      await expect(
        connections.updatePermissions(actor, {
          ...input,
          scopes: ["website:delete"],
        }),
      ).rejects.toBeDefined();
      const { PATCH, GET } =
        await import("../../src/app/api/admin/integrations/automation/oauth/route");
      const crossOrigin = await PATCH(
        new Request(`${origin}/api/admin/integrations/automation/oauth`, {
          method: "PATCH",
          headers: {
            ...Object.fromEntries(headers),
            origin: "https://evil.example",
            "content-type": "application/json",
          },
          body: JSON.stringify(input),
        }),
      );
      expect(crossOrigin.status).toBe(403);
      expect(
        (
          await GET(
            new Request(
              `${origin}/api/admin/integrations/automation/oauth?clientId=${client.clientId}`,
            ),
          )
        ).status,
      ).toBe(401);
      // A separately approved staff identity still cannot manage another person's client.
      const otherId = randomUUID();
      await pool.query(
        "INSERT INTO club.user(id,name,email,email_verified,created_at,updated_at) VALUES($1,'Synthetic other admin',$2,true,now(),now())",
        [otherId, `${otherId}@example.test`],
      );
      await pool.query(
        "INSERT INTO club.membership(organization_id,user_id,role,status) SELECT organization_id,$1,'administrator','approved' FROM club.membership WHERE user_id=$2",
        [otherId, actor.userId],
      );
      const other = {
        ...actor,
        userId: otherId,
        email: `${otherId}@example.test`,
      };
      expect(await connections.list(other)).toEqual([]);
      await expect(
        connections.activity(other, client.clientId),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        connections.updatePermissions(other, input),
      ).rejects.toMatchObject({ status: 403 });
      const priorConsent = await authorize(
        client.clientId,
        callback,
        "website:read sources:read offline_access",
      );
      const saved = await connections.updatePermissions(actor, input);
      expect(saved.reconnectRequired).toBe(true);
      await expect(
        connections.consent(actor, headers, {
          oauth_query: priorConsent.signed,
          accept: true,
          scopes: ["website:read", "sources:read", "offline_access"],
          expectedRevision: "initial",
        }),
      ).rejects.toMatchObject({ code: "OAUTH_PERMISSIONS_CHANGED" });
      await expect(
        connections.updatePermissions(actor, input),
      ).rejects.toMatchObject({ code: "OAUTH_PERMISSIONS_CHANGED" });
      const after = (await connections.list(actor)).find(
        (item) => item.clientId === client.clientId,
      )!;
      expect(after).toMatchObject({
        scopes: ["website:read", "sources:read"],
        sourceOrigins: ["https://new.example.org"],
        redirectUris: [callback],
        approvedScopes: [],
        consentedAt: null,
      });
      for (const token of [tokens.access_token, renewed.access_token])
        await expect(access.authenticate(token)).rejects.toMatchObject({
          status: 401,
        });
      // Invalidate both the latest refresh token and a just-rotated retry response.
      expect((await exchange(refreshInput)).ok).toBe(false);
      expect(
        (
          await exchange({
            ...refreshInput,
            refresh_token: renewed.refresh_token,
          })
        ).ok,
      ).toBe(false);
      const next = await tokenRequest(
        "website:read sources:read offline_access",
      );
      expect(
        (await access.authenticate(next.access_token)).sourceOrigins,
      ).toEqual(["https://new.example.org"]);
      // Fresh consent must never revive the old access/refresh tokens.
      await expect(
        access.authenticate(renewed.access_token),
      ).rejects.toMatchObject({ status: 401 });
      expect(
        (
          await exchange({
            ...refreshInput,
            refresh_token: renewed.refresh_token,
          })
        ).ok,
      ).toBe(false);
      const events = await connections.activity(actor, client.clientId);
      expect(events.map((item) => item.action)).toEqual(
        expect.arrayContaining([
          "automation.oauth.created",
          "automation.oauth.authorized",
          "automation.oauth.permissions_updated",
          "automation.tool.succeeded.automation_capabilities",
          "automation.tool.failed.calendar_create",
        ]),
      );
      const serialized = JSON.stringify(events);
      for (const secret of [
        client.clientSecret!,
        tokens.access_token,
        renewed.refresh_token,
        "NEVER RECORD INPUT",
        other.email,
      ])
        expect(serialized.includes(secret)).toBe(false);
      for (const entry of events)
        expect(Object.keys(entry).sort()).toEqual(["action", "at", "id"]);
      await pool.query(
        "INSERT INTO club.audit_entry(organization_id,actor_user_id,action,target_id) SELECT organization_id,$1,'automation.tool.succeeded.automation_capabilities',$2 FROM club.membership CROSS JOIN generate_series(1,35) WHERE user_id=$1",
        [actor.userId, `oauth:${client.clientId}`],
      );
      expect(await connections.activity(actor, client.clientId)).toHaveLength(
        30,
      );
      // Concurrent editors cannot overwrite one another or reuse the original revision.
      const concurrent = {
        ...input,
        expectedRevision: saved.permissionsRevision,
        scopes: ["website:read", "website:write"],
        sourceOrigins: [],
      };
      const results = await Promise.allSettled([
        connections.updatePermissions(actor, concurrent),
        connections.updatePermissions(actor, concurrent),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      await connections.revoke(actor, headers, client.clientId);
      await expect(
        connections.activity(actor, client.clientId),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
}
