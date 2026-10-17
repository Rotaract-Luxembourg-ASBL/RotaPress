import { createHash, randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { RenewalContext } from "./oauth-renewal-cases";
import { removeOAuthConnection } from "./oauth-test-cleanup";

export function oauthLifecycleChecks(context: () => RenewalContext) {
  describe("C14 OAuth access revocation and permanent removal", () => {
    it("revokes every grant while retaining credentials for an explicit fresh consent", async () => {
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
      const callback = `${origin}/synthetic-lifecycle-callback`;
      const client = await connections.create(actor, headers, {
        name: "Synthetic reconnectable client",
        redirectUris: [callback],
        scopes: ["website:read", "sources:read"],
        sourceOrigins: ["https://www.example.org"],
      });
      const other = await connections.create(actor, headers, {
        name: "Synthetic independent client",
        redirectUris: [callback],
        scopes: ["website:read"],
        sourceOrigins: [],
      });
      const sentinel = randomUUID();
      await pool.query(
        "INSERT INTO club.verification(id,identifier,value,expires_at) VALUES($1,$1,'not-json-otp-state',now()+interval '5 minutes')",
        [sentinel],
      );
      const codeRequest = (
        flow: { code: string; verifier: string },
        selected = client,
      ) =>
        exchange({
          grant_type: "authorization_code",
          client_id: selected.clientId,
          client_secret: selected.clientSecret!,
          redirect_uri: callback,
          resource,
          code: flow.code,
          code_verifier: flow.verifier,
        });
      try {
        const flow = await authorize(
          client.clientId,
          callback,
          "website:read sources:read offline_access",
        );
        const issued = await codeRequest(flow);
        expect(issued.status).toBe(200);
        const tokens = (await issued.json()) as {
          access_token: string;
          refresh_token: string;
        };
        const refresh = (token: string) =>
          exchange({
            grant_type: "refresh_token",
            client_id: client.clientId,
            client_secret: client.clientSecret!,
            resource,
            refresh_token: token,
          });
        const rotated = await refresh(tokens.refresh_token);
        expect(rotated.status).toBe(200);
        const renewed = (await rotated.json()) as typeof tokens;
        const unused = await authorize(
          client.clientId,
          callback,
          "website:read sources:read offline_access",
        );
        const independent = await authorize(other.clientId, callback);
        const before = (await connections.list(actor)).clients.find(
          (item) => item.clientId === client.clientId,
        )!;
        const credentials = await pool.query(
          "SELECT client_secret,redirect_uris,scopes FROM club.oauth_client WHERE client_id=$1",
          [client.clientId],
        );
        await expect(
          connections.revoke(
            {
              ...actor,
              authenticatedAt: new Date(Date.now() - 13 * 60 * 60000),
            },
            headers,
            client.clientId,
            before.permissionsRevision,
          ),
        ).rejects.toMatchObject({
          code: "RECENT_AUTH_REQUIRED",
        });
        const revoked = await connections.revoke(
          actor,
          headers,
          client.clientId,
          before.permissionsRevision,
        );
        expect(revoked.reconnectRequired).toBe(true);
        const after = (await connections.list(actor)).clients.find(
          (item) => item.clientId === client.clientId,
        )!;
        expect(after).toMatchObject({
          scopes: before.scopes,
          redirectUris: before.redirectUris,
          sourceOrigins: before.sourceOrigins,
          approvedScopes: [],
          consentedAt: null,
          permissionsRevision: revoked.permissionsRevision,
        });
        expect(after.permissionsRevision).not.toBe(before.permissionsRevision);
        expect(
          (
            await pool.query(
              "SELECT client_secret,redirect_uris,scopes FROM club.oauth_client WHERE client_id=$1",
              [client.clientId],
            )
          ).rows,
        ).toEqual(credentials.rows);
        await expect(
          connections.consent(actor, headers, {
            oauth_query: unused.signed,
            expectedRevision: before.permissionsRevision,
            accept: true,
            scopes: ["website:read", "sources:read", "offline_access"],
          }),
        ).rejects.toMatchObject({ code: "OAUTH_PERMISSIONS_CHANGED" });
        await expect(
          connections.revoke(
            actor,
            headers,
            client.clientId,
            before.permissionsRevision,
          ),
        ).rejects.toMatchObject({ code: "OAUTH_PERMISSIONS_CHANGED" });
        await expect(
          connections.remove(
            actor,
            headers,
            client.clientId,
            before.permissionsRevision,
          ),
        ).rejects.toMatchObject({ code: "OAUTH_PERMISSIONS_CHANGED" });
        for (const token of [tokens.access_token, renewed.access_token])
          await expect(access.authenticate(token)).rejects.toMatchObject({
            status: 401,
          });
        expect((await refresh(tokens.refresh_token)).ok).toBe(false);
        expect((await refresh(renewed.refresh_token)).ok).toBe(false);
        expect((await codeRequest(unused)).ok).toBe(false);
        expect((await codeRequest(independent, other)).status).toBe(200);
        expect(
          (
            await pool.query("SELECT id FROM club.verification WHERE id=$1", [
              sentinel,
            ])
          ).rowCount,
        ).toBe(1);
        const fresh = await authorize(
          client.clientId,
          callback,
          "website:read sources:read offline_access",
        );
        const reconnected = await codeRequest(fresh);
        expect(reconnected.status).toBe(200);
        const newTokens = (await reconnected.json()) as typeof tokens;
        expect(
          (await access.authenticate(newTokens.access_token)).sourceOrigins,
        ).toEqual(before.sourceOrigins);
        await expect(
          access.authenticate(renewed.access_token),
        ).rejects.toMatchObject({ status: 401 });
        expect((await refresh(renewed.refresh_token)).ok).toBe(false);
        expect(
          (await connections.activity(actor, client.clientId)).some(
            (entry) => entry.action === "automation.oauth.revoked",
          ),
        ).toBe(true);
      } finally {
        await removeOAuthConnection(
          connections,
          actor,
          headers,
          client.clientId,
        );
        await removeOAuthConnection(
          connections,
          actor,
          headers,
          other.clientId,
        );
        await pool.query("DELETE FROM club.verification WHERE id=$1", [
          sentinel,
        ]);
      }
    });

    it("keeps old codes invalidated when the outer audit transaction fails", async () => {
      const {
        connections,
        actor,
        headers,
        origin,
        resource,
        authorize,
        exchange,
      } = context();
      const callback = `${origin}/synthetic-audit-failure-callback`;
      const client = await connections.create(actor, headers, {
        name: "Synthetic atomic grant invalidation",
        redirectUris: [callback],
        scopes: ["website:read"],
        sourceOrigins: [],
      });
      const codeRequest = (flow: { code: string; verifier: string }) =>
        exchange({
          grant_type: "authorization_code",
          client_id: client.clientId,
          client_secret: client.clientSecret!,
          redirect_uri: callback,
          resource,
          code: flow.code,
          code_verifier: flow.verifier,
        });
      const { AuditRepository } =
        await import("../../src/core/audit/AuditRepository");
      let audit: ReturnType<typeof vi.spyOn> | undefined;
      try {
        const unused = await authorize(client.clientId, callback);
        audit = vi
          .spyOn(AuditRepository.prototype, "record")
          .mockRejectedValueOnce(new Error("Synthetic audit failure"));
        await expect(
          connections.revoke(actor, headers, client.clientId, "initial"),
        ).rejects.toThrow("Synthetic audit failure");
        audit.mockRestore();
        const current = (await connections.list(actor)).clients.find(
          (item) => item.clientId === client.clientId,
        )!;
        expect(current.permissionsRevision).not.toBe("initial");
        expect(current.approvedScopes).toEqual([]);
        const fresh = await authorize(client.clientId, callback);
        expect((await codeRequest(fresh)).status).toBe(200);
        expect((await codeRequest(unused)).ok).toBe(false);
      } finally {
        audit?.mockRestore();
        await removeOAuthConnection(
          connections,
          actor,
          headers,
          client.clientId,
        );
      }
    });

    it("requires current ownership and explicit guarded HTTP commands", async () => {
      const { pool, connections, actor, headers, origin } = context();
      const client = await connections.create(actor, headers, {
        name: "Synthetic guarded revocation",
        redirectUris: [`${origin}/synthetic-guard-callback`],
        scopes: ["website:read"],
        sourceOrigins: [],
      });
      const otherId = randomUUID();
      await pool.query(
        "INSERT INTO club.user(id,name,email,email_verified,created_at,updated_at) VALUES($1,'Synthetic admin',$2,true,now(),now())",
        [otherId, `${otherId}@example.test`],
      );
      await pool.query(
        "INSERT INTO club.membership(organization_id,user_id,role,status) SELECT organization_id,$1,'administrator','approved' FROM club.membership WHERE user_id=$2",
        [otherId, actor.userId],
      );
      try {
        const other = {
          ...actor,
          userId: otherId,
          email: `${otherId}@example.test`,
        };
        for (const action of ["revoke", "remove"] as const)
          await expect(
            connections[action](other, headers, client.clientId, "initial"),
          ).rejects.toMatchObject({ status: 403 });
        const { DELETE } =
          await import("../../src/app/api/admin/integrations/automation/oauth/route");
        const request = (
          body: unknown,
          authenticated = true,
          requestOrigin = origin,
        ) =>
          new Request(`${origin}/api/admin/integrations/automation/oauth`, {
            method: "DELETE",
            headers: {
              ...(authenticated ? Object.fromEntries(headers) : {}),
              origin: requestOrigin,
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          });
        const input = {
          clientId: client.clientId,
          action: "revoke",
          expectedRevision: "initial",
          confirmed: true,
        };
        expect((await DELETE(request(input, false))).status).toBe(401);
        expect(
          (await DELETE(request(input, true, "https://evil.example"))).status,
        ).toBe(403);
        for (const body of [
          { clientId: client.clientId },
          { ...input, confirmed: false },
          { ...input, action: "delete" },
        ])
          expect((await DELETE(request(body))).status).toBe(400);
        const response = await DELETE(request(input));
        expect(response.status).toBe(200);
        const result = (await response.json()) as {
          permissionsRevision: string;
        };
        expect((await DELETE(request(input))).status).toBe(409);
        const removed = await DELETE(
          request({
            ...input,
            action: "remove",
            expectedRevision: result.permissionsRevision,
          }),
        );
        expect(removed.status).toBe(200);
        expect(await removed.json()).toEqual({ removed: true });
        expect(
          (await connections.list(actor)).clients.some(
            (item) => item.clientId === client.clientId,
          ),
        ).toBe(false);
      } finally {
        const current = (await connections.list(actor)).clients.find(
          (item) => item.clientId === client.clientId,
        );
        if (current)
          await removeOAuthConnection(
            connections,
            actor,
            headers,
            client.clientId,
          );
        await pool.query("DELETE FROM club.membership WHERE user_id=$1", [
          otherId,
        ]);
        await pool.query("DELETE FROM club.user WHERE id=$1", [otherId]);
      }
    });

    it("routes deleted or missing client authorization to safe OAuth recovery", async () => {
      const { connections, actor, headers, origin, resource, protocol } =
        context();
      const callback = `${origin}/synthetic-removed-callback`;
      const client = await connections.create(actor, headers, {
        name: "Synthetic removed client",
        redirectUris: [callback],
        scopes: ["website:read"],
        sourceOrigins: [],
      });
      await connections.remove(actor, headers, client.clientId, "initial");
      const query = new URLSearchParams({
        response_type: "code",
        client_id: client.clientId,
        redirect_uri: callback,
        resource,
        state: "private-client-state",
        code_challenge_method: "S256",
        code_challenge: createHash("sha256")
          .update(randomBytes(32))
          .digest("base64url"),
      });
      for (const missing of [false, true]) {
        if (missing) query.delete("client_id");
        const response = await protocol(
          new Request(`${origin}/api/auth/oauth2/authorize?${query}`, {
            headers: { accept: "text/html" },
          }),
        );
        expect(response.status).toBe(302);
        const location = new URL(response.headers.get("location")!);
        expect(location.origin).toBe(origin);
        expect(location.pathname).toBe("/oauth/error");
        expect([...location.searchParams.keys()]).toEqual(["error"]);
        expect(["invalid_client", "invalid_request"]).toContain(
          location.searchParams.get("error"),
        );
        expect(response.headers.get("cache-control")).toContain("no-store");
      }
    });

    it("counts retained registrations after revocation and frees capacity only on removal", async () => {
      const { pool, connections, actor, headers, origin } = context();
      const input = {
        name: "Synthetic limited client",
        redirectUris: [`${origin}/synthetic-limit-callback`],
        scopes: ["website:read"],
        sourceOrigins: [],
      };
      const client = await connections.create(actor, headers, input);
      const prefix = `synthetic-limit-${randomUUID()}`;
      const active = await pool.query(
        "SELECT count(*)::integer AS count FROM club.oauth_client WHERE user_id=$1 AND disabled=false",
        [actor.userId],
      );
      const added = 20 - (active.rows[0].count as number);
      try {
        await pool.query(
          "INSERT INTO club.oauth_client(id,client_id,user_id,redirect_uris,disabled,metadata) SELECT $1||n,$1||n,$2,ARRAY[$3],false,$4 FROM generate_series(1,$5) n",
          [
            prefix,
            actor.userId,
            input.redirectUris[0],
            {
              purpose: "rotapress-oauth-v1",
              organizationId: (
                await pool.query(
                  "SELECT organization_id FROM club.membership WHERE user_id=$1",
                  [actor.userId],
                )
              ).rows[0].organization_id,
              sourceOrigins: [],
            },
            added,
          ],
        );
        const revoked = await connections.revoke(
          actor,
          headers,
          client.clientId,
          "initial",
        );
        await expect(
          connections.create(actor, headers, input),
        ).rejects.toMatchObject({ code: "OAUTH_CLIENT_LIMIT" });
        await connections.remove(
          actor,
          headers,
          client.clientId,
          revoked.permissionsRevision,
        );
        const replacement = await connections.create(actor, headers, input);
        await removeOAuthConnection(
          connections,
          actor,
          headers,
          replacement.clientId,
        );
      } finally {
        await pool.query(
          "DELETE FROM club.oauth_client WHERE user_id=$1 AND client_id LIKE $2",
          [actor.userId, `${prefix}%`],
        );
        const retained = (await connections.list(actor)).clients.find(
          (item) => item.clientId === client.clientId,
        );
        if (retained)
          await removeOAuthConnection(
            connections,
            actor,
            headers,
            client.clientId,
          );
      }
    });

    it("preserves only valid signed login handoffs and recovers expired or invalid requests", async () => {
      const { connections, actor, headers, origin, authorize } = context();
      const client = await connections.create(actor, headers, {
        name: "Synthetic signed handoff",
        redirectUris: [`${origin}/synthetic-handoff-callback`],
        scopes: ["website:read"],
        sourceOrigins: [],
      });
      try {
        const flow = await authorize(
          client.clientId,
          `${origin}/synthetic-handoff-callback`,
        );
        const { GET } =
          await import("../../src/app/api/automation/oauth/sign-in/route");
        const request = (query: string) =>
          new Request(`${origin}/api/automation/oauth/sign-in?${query}`);
        const valid = await GET(request(flow.signed));
        expect(valid.status).toBe(307);
        const destination = new URL(valid.headers.get("location")!);
        expect(destination.pathname).toBe("/sign-in");
        expect(destination.searchParams.get("next")).toBe("/oauth/continue");
        expect(valid.headers.get("set-cookie")).toContain("HttpOnly");
        const assertRecovery = (response: Response) => {
          expect(response.status).toBe(307);
          expect(response.headers.get("location")).toBe(
            `${origin}/oauth/error?error=invalid_request`,
          );
          expect(response.headers.get("set-cookie")).toContain(
            "rotapress_oauth_request=;",
          );
          expect(response.headers.get("cache-control")).toContain("no-store");
          expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        };
        for (const query of [
          "",
          "client_id=unsigned",
          `${flow.signed}&extra=unsigned`,
        ])
          assertRecovery(await GET(request(query)));
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.now() + 121000);
        assertRecovery(await GET(request(flow.signed)));
      } finally {
        vi.useRealTimers();
        await removeOAuthConnection(
          connections,
          actor,
          headers,
          client.clientId,
        );
      }
    });
  });
}
