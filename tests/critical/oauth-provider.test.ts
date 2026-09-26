import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
  ({ auth } = await import("../../src/core/auth/server"));
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
  await migrationPool?.end();
});

async function authorize(
  clientId: string,
  callback: string,
  scopes = "website:read offline_access",
) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(24).toString("base64url");
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    resource,
    scope: scopes,
    state,
    response_type: "code",
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
  expect(details.scopes).toEqual(scopes.split(" "));
  const result = await connections.consent(actor, headers, {
    oauth_query: signed,
    accept: true,
    scopes: scopes.split(" "),
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
      resource,
    };
    const refreshed = await exchange(refreshInput);
    expect(refreshed.status).toBe(200);
    const renewed = (await refreshed.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(Boolean(await access.authenticate(renewed.access_token))).toBe(true);
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
    expect((await exchange(refreshInput)).ok).toBe(false); // Rotated refresh token cannot be reused.
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
    const flow = await authorize(client.clientId, callback, "website:read");
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
    await auth.api.signOut({ headers });
    await expect(access.authenticate(token.access_token)).rejects.toMatchObject(
      { status: 401 },
    );
  });
});
