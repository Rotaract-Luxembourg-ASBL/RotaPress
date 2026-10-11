import { createHash, randomBytes } from "node:crypto";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import type { OAuthClient } from "../../src/integrations/automation/oauth/connection-types";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { openOAuthFromAssistant } from "./oauth-navigation-journey";
import {
  removeOAuthConnection,
  revokeOAuthConnection,
} from "./oauth-connections-journey";

export type OAuthLoginFixture = {
  ownerEmail: string;
  signIn: (
    page: Page,
    email: string,
    next: string,
    preserveNavigation?: boolean,
  ) => Promise<void>;
};

const endpoint = "/api/admin/integrations/automation/oauth";
const pendingCookie = "rotapress_oauth_request";
const name = "Synthetic OAuth assistant";
const consentHeading = `Allow ${name} to help your club?`;

/** Real Mailpit OTP and sign-out; the main owner's session and keys remain active. */
export async function oauthSignInReturnJourney(
  visitor: Page,
  authorizeUrl: string,
  login: OAuthLoginFixture,
) {
  await openOAuthFromAssistant(visitor, authorizeUrl);
  const handoff = new URL(visitor.url());
  expect(handoff.pathname).toBe("/sign-in");
  expect(handoff.searchParams.get("next")).toBe("/oauth/continue");
  expect(handoff.searchParams.get("reauth")).toBe("1");
  const pending = (await visitor.context().cookies()).find(
    (cookie) => cookie.name === pendingCookie,
  );
  expect(Boolean(pending?.httpOnly)).toBe(true);
  await login.signIn(visitor, login.ownerEmail, "/oauth/continue", true);
  await expect(
    visitor.getByRole("heading", { name: consentHeading, exact: true }),
  ).toBeVisible();
  // Switching account from the actual sign-in view must retain this request.
  await visitor.goto(handoff.href);
  const signOut = visitor.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/auth/sign-out" &&
      response.request().method() === "POST",
  );
  await visitor.getByRole("button", { name: "Sign out", exact: true }).click();
  expect((await signOut).status()).toBe(200);
  await expect
    .poll(async () => {
      const session = await visitor.request.get("/api/auth/get-session");
      return session.ok() && (await session.json()) === null;
    })
    .toBe(true);
  await expect(visitor).toHaveURL(/\/sign-in\?/);
  const signedOut = new URL(visitor.url());
  expect(signedOut.origin).toBe(smokeOrigin);
  expect(signedOut.pathname).toBe("/sign-in");
  expect(signedOut.searchParams.get("next")).toBe("/oauth/continue");
  expect(signedOut.searchParams.get("reauth")).toBe("1");
  await expect(visitor.getByLabel("Email address")).toBeVisible();
  expect(
    (await visitor.context().cookies()).find(
      (cookie) => cookie.name === pendingCookie,
    )?.value === pending?.value,
  ).toBe(true);
  await login.signIn(visitor, login.ownerEmail, "/oauth/continue", true);
  await expect(
    visitor.getByRole("heading", { name: consentHeading, exact: true }),
  ).toBeVisible();
  await expect(visitor).toHaveURL(`${smokeOrigin}/oauth/continue`);
  // Leave the shared remote request context anonymous for subsequent bearer checks.
  expect(
    (
      await visitor.request.post("/api/auth/sign-out", {
        headers: { origin: smokeOrigin },
        data: {},
      })
    ).status(),
  ).toBe(200);
}

async function clients(owner: Page) {
  const response = await owner.request.get(endpoint);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { clients: OAuthClient[] }).clients;
}

async function captureConnectionError(page: Page, signedIn: boolean) {
  const viewport = page.viewportSize();
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    "AI connection unavailable",
  );
  await expect(main).toContainText("create a new OAuth connection");
  await expect(
    main.getByRole("link", {
      name: signedIn ? "Open MCP settings" : "Sign in to MCP settings",
      exact: true,
    }),
  ).toHaveAttribute(
    "href",
    signedIn
      ? "/admin/integrations/mcp"
      : "/sign-in?next=%2Fadmin%2Fintegrations%2Fmcp",
  );
  await expect(main.getByRole("button", { name: /Google/ })).toHaveCount(0);
  await expect(main.getByLabel("Email address")).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/oauth-removed-${signedIn ? "owner" : "visitor"}-${width}.png`,
      fullPage: true,
    });
  }
  if (viewport) await page.setViewportSize(viewport);
}

/** Revoke preserves registration; removal requires new credentials and useful recovery. */
export async function oauthReconnectJourney(
  owner: Page,
  remote: BrowserContext,
  issued: { clientId: string; clientSecret: string },
  initialParams: URLSearchParams,
  initialSignedQuery: string,
  expiredToken: string,
) {
  const before = (await clients(owner)).find(
    (client) => client.clientId === issued.clientId,
  )!;
  const verifier = randomBytes(32).toString("base64url");
  const params = new URLSearchParams(initialParams);
  params.set("state", randomBytes(24).toString("base64url"));
  params.set("scope", "website:read");
  params.set(
    "code_challenge",
    createHash("sha256").update(verifier).digest("base64url"),
  );
  const authorize = `${smokeOrigin}/api/auth/oauth2/authorize?${params}`;
  await openOAuthFromAssistant(owner, authorize);
  await expect(
    owner.getByRole("heading", { name: consentHeading, exact: true }),
  ).toBeVisible();
  const pendingQuery = new URL(owner.url()).searchParams.toString();
  await owner.goto("/admin/integrations/mcp");
  await revokeOAuthConnection(owner, name);
  const revoked = (await clients(owner)).find(
    (client) => client.clientId === issued.clientId,
  )!;
  expect(revoked).toMatchObject({
    name: before.name,
    redirectUris: before.redirectUris,
    scopes: before.scopes,
    sourceOrigins: before.sourceOrigins,
    authentication: before.authentication,
    disabled: false,
    approvedScopes: [],
    consentedAt: null,
  });
  expect(revoked.permissionsRevision === before.permissionsRevision).toBe(
    false,
  );
  await expect(
    owner.getByText("Reconnect required", { exact: true }),
  ).toBeVisible();
  // Neither the original consent nor a request open before revocation can approve it.
  for (const query of [initialSignedQuery, pendingQuery]) {
    const stale = await owner.request.post("/api/automation/oauth/consent", {
      headers: { origin: smokeOrigin },
      data: {
        oauth_query: query.replace(/^\?/, ""),
        expectedRevision: before.permissionsRevision,
        accept: true,
        scopes: ["website:read"],
      },
    });
    expect(stale.status()).toBe(409);
  }
  expect(
    (await clients(owner)).find((client) => client.clientId === issued.clientId)
      ?.consentedAt,
  ).toBeNull();
  expect(
    (
      await remote.request.get("/api/mcp", {
        headers: { authorization: `Bearer ${expiredToken}` },
      })
    ).status(),
  ).toBe(401);
  await openOAuthFromAssistant(owner, authorize);
  await expect(
    owner.getByRole("heading", { name: consentHeading, exact: true }),
  ).toBeVisible();
  await owner
    .getByRole("button", { name: "Allow selected actions", exact: true })
    .click();
  await expect(owner).toHaveURL(/\/synthetic-oauth-callback\?/);
  const code = new URL(owner.url()).searchParams.get("code");
  expect(Boolean(code)).toBe(true);
  const exchanged = await remote.request.post("/api/auth/oauth2/token", {
    form: {
      grant_type: "authorization_code",
      client_id: issued.clientId,
      client_secret: issued.clientSecret,
      code: code!,
      code_verifier: verifier,
      redirect_uri: params.get("redirect_uri")!,
      resource: `${smokeOrigin}/api/mcp`,
    },
  });
  expect(exchanged.status()).toBe(200);
  const tokens = (await exchanged.json()) as {
    access_token: string;
    scope: string;
  };
  expect(tokens.scope.split(" ").sort()).toEqual([
    "offline_access",
    "website:read",
  ]);
  const bearer = { authorization: `Bearer ${tokens.access_token}` };
  expect(
    (await remote.request.get("/api/mcp", { headers: bearer })).status(),
  ).toBe(405);
  await owner.goto("/admin/integrations/mcp");
  await removeOAuthConnection(owner, name);
  expect(
    (await clients(owner)).some(
      (client) => client.clientId === issued.clientId,
    ),
  ).toBe(false);
  expect(
    (await remote.request.get("/api/mcp", { headers: bearer })).status(),
  ).toBe(401);
  await openOAuthFromAssistant(owner, authorize);
  await expect(owner).toHaveURL(
    `${smokeOrigin}/oauth/error?error=invalid_client`,
  );
  await captureConnectionError(owner, true);
  const visitor = await remote.newPage();
  try {
    await openOAuthFromAssistant(visitor, authorize);
    await expect(visitor).toHaveURL(
      `${smokeOrigin}/oauth/error?error=invalid_client`,
    );
    await captureConnectionError(visitor, false);
    await visitor.goto(
      "/sign-in?error=invalid_client&error_description=synthetic-private-description&next=https%3A%2F%2Funtrusted.example",
    );
    await expect(visitor).toHaveURL(
      `${smokeOrigin}/oauth/error?error=invalid_client`,
    );
    await expect(visitor.getByRole("main")).not.toContainText(
      "synthetic-private-description",
    );
  } finally {
    await visitor.close();
  }
}
