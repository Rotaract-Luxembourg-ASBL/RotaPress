import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { oauthRenewalChecks } from "./oauth-renewal-cases";

const delivery = vi.hoisted(() => ({ code: "" }));
vi.mock("@/composition/email", async (original) => ({
  ...(await original<typeof import("../../src/composition/email")>()),
  mailer: {
    async sendVerificationCode(_email: string, code: string) {
      delivery.code = code;
    },
  },
}));
vi.mock("@/core/config", async () => {
  const { runtimeConfiguration } =
    await import("../../src/core/runtime_configuration");
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  return {
    config: runtimeConfiguration({
      ...env,
      NODE_ENV: "test",
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    }),
    serverEmail: {
      remoteEnabled: false,
      localEnabled: false,
      connection: null,
    },
  };
});

let migrationPool: Pool;
let runtimePool: Pool;
let auth: typeof import("../../src/core/auth/server").auth;
let connections: typeof import("../../src/composition/automation").oauthConnections;
let access: typeof import("../../src/composition/automation").oauthAccess;
let actor: NonNullable<
  Awaited<ReturnType<typeof import("../../src/core/auth/actor").getActor>>
>;
let headers: Headers;
let origin: string;
let resource: string;
let protocol: typeof import("../../src/integrations/automation/oauth/http").oauthProtocolRequest;

function testConnection(value: string | undefined) {
  if (!value) throw new Error("Run setup first.");
  const target = new URL(value);
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.pathname !== "/rotapress_test"
  )
    throw new Error("OAuth tests require the disposable local test database.");
  return value;
}

beforeAll(async () => {
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  migrationPool = new Pool({
    connectionString: testConnection(env.TEST_MIGRATION_DATABASE_URL),
    max: 2,
  });
  testConnection(env.DATABASE_URL);
  await migrationPool.query(
    "TRUNCATE club.organization, club.user, club.installation CASCADE",
  );
  const configuration = await import("../../src/core/config");
  origin = configuration.config.APP_URL;
  resource = `${origin}/api/mcp`;
  // Simulate an installation whose persisted resource predates the new actions.
  // Its unrelated policy must survive the provider's configured resource merge.
  await migrationPool.query(
    `INSERT INTO club.oauth_resource
       (id,identifier,name,allowed_scopes,disabled,access_token_ttl,metadata)
     VALUES($1,$2,$3,$4,true,180,$5)
     ON CONFLICT(identifier) DO UPDATE SET
       allowed_scopes=EXCLUDED.allowed_scopes, disabled=EXCLUDED.disabled,
       access_token_ttl=EXCLUDED.access_token_ttl, metadata=EXCLUDED.metadata`,
    [
      `synthetic-resource-${randomBytes(8).toString("hex")}`,
      resource,
      "Synthetic legacy resource",
      ["website:read", "calendar:read", "offline_access"],
      { fixture: "oauth-resource-upgrade" },
    ],
  );
  ({ auth } = await import("../../src/core/auth/server"));
  await auth.$context;
  const { oauthOptions } = await import("../../src/core/auth/automation_oauth");
  const seeded = await migrationPool.query(
    "SELECT allowed_scopes,disabled,access_token_ttl,metadata FROM club.oauth_resource WHERE identifier=$1",
    [resource],
  );
  expect(seeded.rows[0]).toEqual({
    allowed_scopes: oauthOptions.scopes,
    disabled: true,
    access_token_ttl: 180,
    metadata: { fixture: "oauth-resource-upgrade" },
  });
  // The application preserved disabled=true. Enable only this synthetic fixture.
  await migrationPool.query(
    "UPDATE club.oauth_resource SET disabled=false WHERE identifier=$1",
    [resource],
  );
  ({ pool: runtimePool } =
    await import("../../src/infrastructure/database/client"));
  ({ oauthConnections: connections, oauthAccess: access } =
    await import("../../src/composition/automation"));
  ({ oauthProtocolRequest: protocol } =
    await import("../../src/integrations/automation/oauth/http"));
  const email = `oauth-owner-${randomBytes(6).toString("hex")}@example.test`;
  const claim = randomBytes(32).toString("hex");
  await migrationPool.query(
    "INSERT INTO club.installation (id,nominated_email,claim_hash,claim_expires_at) VALUES(1,$1,$2,$3)",
    [
      email,
      createHash("sha256").update(claim).digest("hex"),
      new Date(Date.now() + 60000),
    ],
  );
  const { authenticationHandler } = await import("../../src/core/auth/server");
  const delivered = await authenticationHandler(
    new Request(`${origin}/api/auth/email-otp/send-verification-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, type: "sign-in" }),
    }),
  );
  expect(delivered.status).toBe(200);
  expect(delivery.code.length).toBe(6);
  const signedIn = await auth.api.signInEmailOTP({
    body: { email, otp: delivery.code },
    asResponse: true,
  });
  expect(signedIn.status).toBe(200);
  headers = new Headers({
    cookie: signedIn.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; "),
    origin,
  });
  const { getActor } = await import("../../src/core/auth/actor");
  const result = await getActor(headers);
  if (!result) throw new Error("Real library OTP did not establish a session.");
  actor = result;
  const { services } = await import("../../src/composition/services");
  await services.installation.complete(actor, {
    claim,
    name: "Synthetic OAuth Club",
    tagline: "",
    description: "",
    locale: "en",
    timezone: "Europe/Luxembourg",
    accentColor: "#25636b",
  });
  const { automationAvailability } =
    await import("../../src/composition/automation");
  await automationAvailability.change(actor, {
    kind: "mcp",
    enabled: true,
    expectedVersion: 0,
    confirmed: true,
  });
});

afterAll(async () => {
  await runtimePool?.end();
  await migrationPool?.query(
    "UPDATE club.oauth_resource SET disabled=false,access_token_ttl=NULL,metadata=NULL WHERE identifier=$1 AND metadata->>'fixture'='oauth-resource-upgrade'",
    [resource],
  );
  await migrationPool?.end();
});

async function authorize(
  clientId: string,
  callback: string,
  scopes: string | null = "website:read offline_access",
  expectedScopes = [
    ...new Set([...(scopes?.split(" ") ?? []), "offline_access"]),
  ],
  selectedScopes = expectedScopes,
) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(24).toString("base64url");
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    resource,
    ...(scopes === null ? {} : { scope: scopes }),
    state,
    response_type: "code",
    prompt: "consent",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  });
  const response = await protocol(
    new Request(`${origin}/api/auth/oauth2/authorize?${query}`, {
      headers: new Headers([...headers, ["accept", "text/html"]]),
    }),
  );
  expect(response.status).toBe(302);
  const consent = new URL(response.headers.get("location")!, origin);
  expect(
    consent.searchParams.get("error_description") ??
      consent.searchParams.get("error"),
  ).toBeNull();
  expect(consent.pathname).toBe("/oauth/consent");
  const signed = consent.searchParams.toString();
  const details = await connections.details(actor, headers, signed);
  expect(details.scopes).toEqual(expectedScopes);
  const result = await connections.consent(actor, headers, {
    oauth_query: signed,
    accept: true,
    scopes: selectedScopes,
  });
  const returned = new URL(result.url);
  expect(returned.searchParams.get("state") === state).toBe(true);
  expect(returned.searchParams.get("iss")).toBe(`${origin}/api/auth`);
  return { code: returned.searchParams.get("code")!, verifier, signed };
}

async function exchange(input: Record<string, string>) {
  return protocol(
    new Request(`${origin}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(input).toString(),
    }),
  );
}

oauthRenewalChecks(() => ({
  pool: migrationPool,
  connections,
  access,
  actor,
  headers,
  origin,
  resource,
  protocol,
  authorize,
  exchange,
}));

describe("C14 Better Auth OAuth with a real OTP session and PostgreSQL", () => {
  it("binds discovery, PKCE, signed consent, exact audience, refresh, current policy and immediate revocation", async () => {
    const callback = `${origin}/synthetic-oauth-callback`;
    const issued = await connections.create(actor, headers, {
      name: "Synthetic OAuth client",
      redirectUris: [callback],
      scopes: ["website:read"],
      sourceOrigins: [],
      authentication: "client_secret_post",
    });
    expect(Boolean(issued.clientSecret)).toBe(true);
    const listed = await connections.list(actor);
    expect(listed.some((item) => item.clientId === issued.clientId)).toBe(true);
    expect(JSON.stringify(listed).includes(issued.clientSecret!)).toBe(false);
    const flow = await authorize(issued.clientId, callback);
    await expect(
      connections.details(
        actor,
        headers,
        flow.signed.replace("website%3Aread", "website%3Awrite"),
      ),
    ).rejects.toBeDefined();
    const base = {
      grant_type: "authorization_code",
      client_id: issued.clientId,
      client_secret: issued.clientSecret!,
      redirect_uri: callback,
      resource,
      code: flow.code,
      code_verifier: flow.verifier,
    };
    const missingResource: Record<string, string> = { ...base };
    delete missingResource.resource;
    expect((await exchange(missingResource)).status).toBe(400);
    expect(
      (
        await exchange({
          ...base,
          resource: "https://other.example.invalid/api/mcp",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await exchange({
          ...base,
          code_verifier: randomBytes(32).toString("base64url"),
        })
      ).ok,
    ).toBe(false);
    const validFlow = await authorize(issued.clientId, callback);
    const response = await exchange({
      ...base,
      code: validFlow.code,
      code_verifier: validFlow.verifier,
    });
    expect(response.status).toBe(200);
    const token = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    expect(token.expires_in).toBeLessThanOrEqual(300);
    const principal = await access.authenticate(token.access_token);
    expect(principal.scopes).toEqual(["website:read"]);
    expect(principal.actor.userId === actor.userId).toBe(true);
    const stored = await migrationPool.query(
      "SELECT token FROM club.oauth_access_token WHERE client_id=$1",
      [issued.clientId],
    );
    expect(
      stored.rows.length > 0 &&
        stored.rows.every(
          (row: { token: string }) => !token.access_token.includes(row.token),
        ),
    ).toBe(true);
    const refreshInput = {
      grant_type: "refresh_token",
      client_id: issued.clientId,
      client_secret: issued.clientSecret!,
      refresh_token: token.refresh_token,
    };
    expect(
      (
        await exchange({
          ...refreshInput,
          resource: "https://other.example.invalid/api/mcp",
        })
      ).status,
    ).toBe(400);
    const refreshed = await exchange(refreshInput);
    expect(refreshed.status).toBe(200);
    const renewed = (await refreshed.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(Boolean(await access.authenticate(renewed.access_token))).toBe(true);
    const retried = await exchange(refreshInput);
    expect(retried.status).toBe(200);
    const replay = await retried.json();
    expect(replay.access_token === renewed.access_token).toBe(true);
    expect(replay.refresh_token === renewed.refresh_token).toBe(true);
    const { automationAvailability } =
      await import("../../src/composition/automation");
    await automationAvailability.change(actor, {
      kind: "mcp",
      enabled: false,
      expectedVersion: 1,
      confirmed: true,
    });
    expect(
      (
        await exchange({
          ...refreshInput,
          refresh_token: renewed.refresh_token,
        })
      ).status,
    ).toBe(409);
    await expect(
      connections.details(actor, headers, validFlow.signed),
    ).rejects.toMatchObject({ code: "AUTOMATION_DISABLED" });
    await automationAvailability.change(actor, {
      kind: "mcp",
      enabled: true,
      expectedVersion: 2,
      confirmed: true,
    });
    await migrationPool.query(
      "UPDATE club.organization SET staff_auth_policy='google'",
    );
    try {
      // Platform policy now rejects the parent email session before staff authorization.
      await expect(
        access.authenticate(renewed.access_token),
      ).rejects.toMatchObject({ code: "OAUTH_SESSION_EXPIRED", status: 401 });
    } finally {
      await migrationPool.query(
        "UPDATE club.organization SET staff_auth_policy='email-or-google'",
      );
    }
    await migrationPool.query(
      "UPDATE club.membership SET status='suspended' WHERE user_id=$1",
      [actor.userId],
    );
    await expect(
      access.authenticate(renewed.access_token),
    ).rejects.toMatchObject({ status: 403 });
    await migrationPool.query(
      "UPDATE club.membership SET status='approved' WHERE user_id=$1",
      [actor.userId],
    );
    await migrationPool.query(
      "UPDATE club.oauth_refresh_token SET rotated_at=NOW()-INTERVAL '11 seconds', rotation_replay_expires_at=NOW()-INTERVAL '1 second' WHERE client_id=$1 AND rotated_at IS NOT NULL",
      [issued.clientId],
    );
    expect((await exchange(refreshInput)).ok).toBe(false); // Reuse outside the retry window is rejected.
    await connections.revoke(actor, headers, issued.clientId);
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
  });
  it("defaults omitted scope to registered actions and preserves an explicit narrower request", async () => {
    const { GET: protectedResource } =
      await import("../../src/app/.well-known/oauth-protected-resource/api/mcp/route");
    const { withOAuthChallenge } =
      await import("../../src/integrations/automation/oauth/challenge");
    const metadata = await protectedResource().json();
    expect(metadata).toMatchObject({
      resource,
      authorization_servers: [`${origin}/api/auth`],
    });
    expect(metadata).not.toHaveProperty("scopes_supported");
    expect(
      withOAuthChallenge(new Response(null, { status: 401 })).headers.get(
        "WWW-Authenticate",
      ),
    ).toBe(
      `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`,
    );
    expect(await auth.api.getOAuthServerConfig()).toMatchObject({
      scopes_supported: expect.arrayContaining([
        "website:read",
        "calendar:write",
        "calendar:publish",
        "website:settings",
        "offline_access",
      ]),
    });

    const callback = `${origin}/synthetic-default-actions`;
    for (const selected of [
      ["website:read"],
      [
        "calendar:read",
        "calendar:write",
        "calendar:publish",
        "website:settings",
      ],
    ]) {
      const client = await connections.create(actor, headers, {
        name: "Synthetic default actions",
        redirectUris: [callback],
        scopes: selected,
        sourceOrigins: [],
      });
      try {
        const requests: { scope: string | null; expected: string[] }[] = [
          { scope: null, expected: [...selected, "offline_access"] },
          { scope: selected[0], expected: [selected[0], "offline_access"] },
        ];
        for (const request of requests) {
          const flow = await authorize(
            client.clientId,
            callback,
            request.scope,
            request.expected,
          );
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
          const token = (await response.json()) as {
            access_token: string;
            scope: string;
          };
          expect(token.scope.split(" ")).toEqual(request.expected);
          expect(
            (await access.authenticate(token.access_token)).scopes,
          ).toEqual(
            request.expected.filter((scope) => scope !== "offline_access"),
          );
        }
        // New global actions and a narrowed consent do not change the client's ceiling.
        expect(
          (await connections.list(actor)).find(
            (entry) => entry.clientId === client.clientId,
          )?.scopes,
        ).toEqual(selected);
      } finally {
        await connections.revoke(actor, headers, client.clientId);
      }
    }
  });

  it("rejects explicit empty, repeated and unregistered scopes without defaulting them", async () => {
    const callback = `${origin}/synthetic-invalid-scope`;
    const client = await connections.create(actor, headers, {
      name: "Synthetic invalid scope boundary",
      redirectUris: [callback],
      scopes: ["website:read"],
      sourceOrigins: [],
    });
    try {
      const query = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: callback,
        resource,
        state: randomBytes(24).toString("base64url"),
        response_type: "code",
        code_challenge_method: "S256",
        code_challenge: createHash("sha256")
          .update(randomBytes(32))
          .digest("base64url"),
      });
      const request = (params: URLSearchParams) =>
        protocol(
          new Request(`${origin}/api/auth/oauth2/authorize?${params}`, {
            headers: new Headers([...headers, ["accept", "text/html"]]),
          }),
        );
      for (const values of [
        [""],
        ["   "],
        ["website:read", "calendar:write"],
      ]) {
        const invalid = new URLSearchParams(query);
        for (const value of values) invalid.append("scope", value);
        const response = await request(invalid);
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          error: "invalid_request",
        });
        expect(response.headers.has("location")).toBe(false);
      }
      const unregistered = new URLSearchParams(query);
      unregistered.set("scope", "website:read calendar:write");
      const response = await request(unregistered);
      expect(response.status).toBe(302);
      const rejected = new URL(response.headers.get("location")!, origin);
      expect(rejected.origin + rejected.pathname).toBe(callback);
      expect(rejected.searchParams.get("error")).toBe("invalid_scope");
      expect(rejected.searchParams.has("code")).toBe(false);
      const stored = await migrationPool.query(
        "SELECT count(*)::integer AS count FROM club.oauth_consent WHERE client_id=$1",
        [client.clientId],
      );
      expect(stored.rows[0].count).toBe(0);
    } finally {
      await connections.revoke(actor, headers, client.clientId);
    }
  });

  it("binds REST tokens and MCP keys to their integration, including legacy key compatibility", async () => {
    const { automationAccess } =
      await import("../../src/composition/automation");
    const rest = await automationAccess.create(actor, {
      name: "REST boundary fixture",
      transport: "rest",
      scopes: ["website:read"],
    });
    const mcp = await automationAccess.create(actor, {
      name: "MCP boundary fixture",
      transport: "mcp",
      scopes: ["website:read"],
    });
    const request = (key: string) =>
      new Request(`${origin}/api/v1/capabilities`, {
        headers: { authorization: `Bearer ${key}` },
      });
    try {
      expect(
        rest.key.startsWith("rp_rest_") && mcp.key.startsWith("rp_mcp_"),
      ).toBe(true);
      const principal = await automationAccess.authenticate(request(rest.key), {
        transport: "rest",
      });
      expect(principal.keyId).toBe(rest.id);
      expect(
        (
          await automationAccess.authenticate(request(mcp.key), {
            transport: "mcp",
          })
        ).keyId,
      ).toBe(mcp.id);
      await expect(
        automationAccess.authenticate(request(rest.key), { transport: "mcp" }),
      ).rejects.toMatchObject({
        code: "AUTOMATION_CREDENTIAL_TRANSPORT",
        status: 401,
      });
      await expect(
        automationAccess.authenticate(request(mcp.key), { transport: "rest" }),
      ).rejects.toMatchObject({
        code: "AUTOMATION_CREDENTIAL_TRANSPORT",
        status: 401,
      });
      const restList = await automationAccess.list(actor, headers, "rest");
      const mcpList = await automationAccess.list(actor, headers, "mcp");
      expect(restList.some((key) => key.id === mcp.id)).toBe(false);
      expect(mcpList.some((key) => key.id === rest.id)).toBe(false);
      expect(JSON.stringify([restList, mcpList]).includes(rest.key)).toBe(
        false,
      );
      // The previous version's metadata lacked transport: preserve REST without granting MCP.
      await migrationPool.query(
        "UPDATE club.apikey SET metadata=$2 WHERE id=$1",
        [
          rest.id,
          JSON.stringify({
            purpose: "rotapress-automation-v1",
            sessionId: actor.sessionId,
            organizationId: principal.organizationId,
            sourceOrigins: [],
          }),
        ],
      );
      expect(
        (
          await automationAccess.authenticate(request(rest.key), {
            transport: "rest",
          })
        ).keyId,
      ).toBe(rest.id);
      await expect(
        automationAccess.authenticate(request(rest.key), { transport: "mcp" }),
      ).rejects.toMatchObject({ status: 401 });
    } finally {
      await automationAccess.revoke(actor, headers, rest.id);
      await automationAccess.revoke(actor, headers, mcp.id);
    }
  });

  it("supports public PKCE clients without cookies on token exchange and revokes delegated access on sign-out", async () => {
    const callback = `${origin}/synthetic-public-callback`;
    const client = await connections.create(actor, headers, {
      name: "Synthetic public PKCE client",
      redirectUris: [callback],
      scopes: ["website:read"],
      sourceOrigins: [],
      authentication: "none",
    });
    expect(client.clientSecret).toBeUndefined();
    const flow = await authorize(
      client.clientId,
      callback,
      "website:read",
      ["website:read", "offline_access"],
      ["website:read"],
    );
    const response = await exchange({
      grant_type: "authorization_code",
      client_id: client.clientId,
      redirect_uri: callback,
      resource,
      code: flow.code,
      code_verifier: flow.verifier,
    });
    expect(response.status).toBe(200);
    const token = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
    };
    expect(token.refresh_token).toBeUndefined();
    expect(Boolean(await access.authenticate(token.access_token))).toBe(true);
    const { automationAccess } =
      await import("../../src/composition/automation");
    const request = new Request(resource, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    expect(
      (await automationAccess.authenticate(request, { transport: "mcp" })).actor
        .userId,
    ).toBe(actor.userId);
    await expect(
      automationAccess.authenticate(request, { transport: "rest" }),
    ).rejects.toMatchObject({
      code: "AUTOMATION_CREDENTIAL_TRANSPORT",
      status: 401,
    });
    await auth.api.signOut({ headers });
    await expect(access.authenticate(token.access_token)).rejects.toMatchObject(
      { status: 401 },
    );
  });
});
