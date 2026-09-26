import { createHash, randomBytes } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import type { Pool } from "pg";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { capture } from "./integration-credentials-journey";
import { oauthPresetsJourney } from "./oauth-presets-journey";
import { openOAuthFromAssistant } from "./oauth-navigation-journey";
import { oauthManagementJourney } from "./oauth-management-journey";

/** Existing real OTP owner session; callback is intercepted on loopback, never external. */
export async function oauthJourney(
  owner: Page,
  browser: Browser,
  database: Pool,
  pageId: string,
) {
  const remote = await browser.newContext();
  const endpoint = "/api/admin/integrations/automation/oauth";
  const callback = `${smokeOrigin}/synthetic-oauth-callback`;
  const viewport = owner.viewportSize();
  try {
    expect((await remote.request.get(endpoint)).status()).toBe(401);
    const challenge = await remote.request.get("/api/mcp");
    expect(challenge.status()).toBe(401);
    expect(challenge.headers()["www-authenticate"]).toContain(
      "/.well-known/oauth-protected-resource/api/mcp",
    );
    const metadata = await remote.request.get(
      "/.well-known/oauth-authorization-server/api/auth",
    );
    expect(metadata.status()).toBe(200);
    expect(await metadata.json()).toMatchObject({
      issuer: `${smokeOrigin}/api/auth`,
      authorization_response_iss_parameter_supported: true,
      code_challenge_methods_supported: ["S256"],
    });
    await owner.goto("/admin/integrations/mcp");
    await oauthPresetsJourney(owner);
    const panel = owner.getByRole("region", {
      name: "Connect with OAuth",
    });
    await panel
      .getByLabel("OAuth connection name", { exact: true })
      .fill("Synthetic OAuth assistant");
    await panel
      .getByRole("textbox", { name: "OAuth callback URLs", exact: true })
      .fill(callback);
    const picker = panel.getByRole("group", {
      name: "OAuth allowed actions",
      exact: true,
    });
    await picker
      .getByRole("button", { name: "Select all", exact: true })
      .click();
    expect(await picker.getByRole("checkbox", { checked: true }).count()).toBe(
      await picker.getByRole("checkbox").count(),
    );
    await picker
      .getByRole("button", { name: "Clear all", exact: true })
      .click();
    for (const name of [
      "Read website content",
      "Copy pages, add languages and restore drafts",
      "Edit draft website menus and appearance",
      "Publish website content and settings on request",
      "Read calendars and activity schedules",
      "Create and manage calendar and activity drafts",
      "Edit draft calendar page design",
      "Publish calendars, activities and page design on request",
    ])
      await picker.getByRole("checkbox", { name, exact: true }).check();
    await capture(owner, "mcp-oauth");
    const created = owner.waitForResponse(
      (response) =>
        response.url().endsWith(endpoint) &&
        response.request().method() === "POST",
    );
    await panel
      .getByRole("button", { name: "Create OAuth connection", exact: true })
      .click();
    const creation = await created;
    expect(creation.status()).toBe(200);
    const issued = (await creation.json()) as {
      clientId: string;
      clientSecret: string;
    };
    expect(
      await panel
        .getByLabel("OAuth client secret", { exact: true })
        .getAttribute("type"),
    ).toBe("password");
    await panel
      .getByRole("button", { name: "I saved the OAuth details", exact: true })
      .click();
    const verifier = randomBytes(32).toString("base64url");
    const state = randomBytes(24).toString("base64url");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: issued.clientId,
      redirect_uri: callback,
      resource: `${smokeOrigin}/api/mcp`,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    const bad = new URLSearchParams(params);
    const navigationHeaders = {
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
    };
    bad.set("resource", "https://other.example.invalid/api/mcp");
    expect(
      (
        await owner.request.get(`/api/auth/oauth2/authorize?${bad}`, {
          maxRedirects: 0,
          headers: navigationHeaders,
        })
      ).status(),
    ).toBe(400);
    bad.set("resource", `${smokeOrigin}/api/mcp`);
    bad.set("code_challenge_method", "plain");
    expect(
      (
        await owner.request.get(`/api/auth/oauth2/authorize?${bad}`, {
          maxRedirects: 0,
          headers: navigationHeaders,
        })
      ).status(),
    ).toBe(400);
    await owner.route(`${callback}**`, async (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Synthetic OAuth callback</h1>",
      }),
    );
    const authorizeUrl = `${smokeOrigin}/api/auth/oauth2/authorize?${params}`;
    const signedOut = await remote.newPage();
    await openOAuthFromAssistant(signedOut, authorizeUrl);
    await expect(signedOut).toHaveURL(
      `${smokeOrigin}/sign-in?reauth=1&next=/admin/integrations/automation/authorize`,
    );
    await expect(signedOut.getByLabel("Email address")).toBeVisible();
    await signedOut.close();
    await openOAuthFromAssistant(owner, authorizeUrl);
    await expect(
      owner.getByRole("heading", {
        name: "Allow Synthetic OAuth assistant to help your club?",
        exact: true,
      }),
    ).toBeVisible();
    for (const name of [
      "Publish website content and settings on request",
      "Publish calendars, activities and page design on request",
    ])
      await expect(
        owner.getByRole("checkbox", { name, exact: true }),
      ).toBeChecked();
    await expect(
      owner.getByRole("checkbox", { name: /^Keep connected/ }),
    ).toBeChecked();
    await owner.setViewportSize({ width: 390, height: 844 });
    expect(
      await owner.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await owner.screenshot({
      path: ".local/oauth-consent-phone.png",
      fullPage: true,
    });
    if (viewport) await owner.setViewportSize(viewport);
    const ownerSession = await owner.request.get("/api/auth/get-session");
    expect(ownerSession.status()).toBe(200);
    const { session } = (await ownerSession.json()) as {
      session: { id: string };
    };
    const originalSession = await database.query<{ created_at: string }>(
      "SELECT created_at::text FROM club.session WHERE id=$1",
      [session.id],
    );
    expect(originalSession.rows.length).toBe(1);
    try {
      await database.query(
        "UPDATE club.session SET created_at=now()-interval '16 minutes' WHERE id=$1",
        [session.id],
      );
      const staleConsent = owner.waitForResponse(
        (response) =>
          response.url().endsWith("/api/automation/oauth/consent") &&
          response.request().method() === "POST",
      );
      await owner
        .getByRole("button", { name: "Allow selected actions", exact: true })
        .click();
      expect((await staleConsent).status()).toBe(401);
      await expect(
        owner.getByRole("link", { name: "Sign in to continue", exact: true }),
      ).toBeVisible();
    } finally {
      await database.query(
        "UPDATE club.session SET created_at=$2 WHERE id=$1",
        [session.id, originalSession.rows[0].created_at],
      );
    }
    await owner
      .getByRole("button", { name: "Allow selected actions", exact: true })
      .click();
    await expect(owner).toHaveURL(/\/synthetic-oauth-callback\?/);
    const result = new URL(owner.url());
    expect(result.searchParams.get("state") === state).toBe(true);
    expect(result.searchParams.get("iss")).toBe(`${smokeOrigin}/api/auth`);
    const code = result.searchParams.get("code");
    expect(Boolean(code)).toBe(true);
    const tokenInput = {
      grant_type: "authorization_code",
      client_id: issued.clientId,
      client_secret: issued.clientSecret,
      code: code!,
      code_verifier: verifier,
      redirect_uri: callback,
      resource: `${smokeOrigin}/api/mcp`,
    };
    const tokenResult = await remote.request.post("/api/auth/oauth2/token", {
      form: tokenInput,
    });
    expect(tokenResult.status()).toBe(200);
    const tokens = (await tokenResult.json()) as {
      access_token: string;
      refresh_token: string;
      scope: string;
    };
    expect(tokens.scope.split(" ")).toEqual(
      expect.arrayContaining([
        "website:publish",
        "calendar:publish",
        "offline_access",
      ]),
    );
    expect(tokens.scope.split(" ")).not.toContain("website:write");
    const bearer = { authorization: `Bearer ${tokens.access_token}` };
    await oauthManagementJourney(remote.request, tokens.access_token, pageId);
    expect(
      (await remote.request.get("/api/mcp", { headers: bearer })).status(),
    ).toBe(405);
    expect(
      (
        await remote.request.get("/api/v1/capabilities", { headers: bearer })
      ).status(),
    ).toBe(401);
    const stored = await database.query(
      "SELECT token FROM club.oauth_access_token WHERE client_id=$1",
      [issued.clientId],
    );
    expect(
      stored.rows.length > 0 &&
        stored.rows.every(
          (row: { token: string }) => !tokens.access_token.includes(row.token),
        ),
    ).toBe(true);
    await database.query(
      "UPDATE club.oauth_access_token SET expires_at=now()-interval '1 second' WHERE client_id=$1",
      [issued.clientId],
    );
    expect(
      (await remote.request.get("/api/mcp", { headers: bearer })).status(),
    ).toBe(401);
    const refreshInput = {
      grant_type: "refresh_token",
      client_id: issued.clientId,
      client_secret: issued.clientSecret,
      refresh_token: tokens.refresh_token,
    };
    const refreshed = await remote.request.post("/api/auth/oauth2/token", {
      form: refreshInput,
    });
    expect(refreshed.status()).toBe(200);
    const rotated = (await refreshed.json()) as {
      access_token: string;
      refresh_token: string;
    };
    const retry = await remote.request.post("/api/auth/oauth2/token", {
      form: refreshInput,
    });
    expect(retry.status()).toBe(200);
    const replayed = (await retry.json()) as typeof rotated;
    expect(replayed.access_token === rotated.access_token).toBe(true);
    expect(replayed.refresh_token === rotated.refresh_token).toBe(true);
    expect(
      (
        await remote.request.get("/api/mcp", {
          headers: { authorization: `Bearer ${rotated.access_token}` },
        })
      ).status(),
    ).toBe(405);
    const reconnectVerifier = randomBytes(32).toString("base64url");
    const reconnectState = randomBytes(24).toString("base64url");
    const reconnectParams = new URLSearchParams(params);
    reconnectParams.set("state", reconnectState);
    reconnectParams.set(
      "code_challenge",
      createHash("sha256").update(reconnectVerifier).digest("base64url"),
    );
    // Matching grants reuse saved consent without another login or approval.
    await openOAuthFromAssistant(
      owner,
      `${smokeOrigin}/api/auth/oauth2/authorize?${reconnectParams}`,
    );
    await expect(owner).toHaveURL(/\/synthetic-oauth-callback\?/);
    const reconnect = new URL(owner.url());
    expect(reconnect.searchParams.get("state") === reconnectState).toBe(true);
    expect(reconnect.searchParams.get("iss")).toBe(`${smokeOrigin}/api/auth`);
    const reconnectCode = reconnect.searchParams.get("code");
    expect(Boolean(reconnectCode)).toBe(true);
    const reconnected = await remote.request.post("/api/auth/oauth2/token", {
      form: {
        ...tokenInput,
        code: reconnectCode!,
        code_verifier: reconnectVerifier,
      },
    });
    expect(reconnected.status()).toBe(200);
    const reconnectTokens = (await reconnected.json()) as {
      access_token: string;
      scope: string;
    };
    expect(reconnectTokens.scope.split(" ").sort()).toEqual(
      tokens.scope.split(" ").sort(),
    );
    expect(
      (
        await remote.request.get("/api/mcp", {
          headers: { authorization: `Bearer ${reconnectTokens.access_token}` },
        })
      ).status(),
    ).toBe(405);
    expect(
      (
        await owner.request.post("/api/auth/oauth2/register", {
          headers: { origin: smokeOrigin },
          data: {},
        })
      ).status(),
    ).toBe(404);
    await owner.goto("/admin/integrations/mcp?tab=docs");
    await owner
      .getByLabel("MCP access key or OAuth access token", { exact: true })
      .fill(rotated.access_token);
    await owner
      .getByRole("button", { name: "Send read request", exact: true })
      .click();
    await expect(
      owner.getByRole("region", { name: "Test response" }).getByRole("status"),
    ).toHaveText("Request succeeded · HTTP 200");
    await owner.goto("/admin/integrations/mcp");
    await owner
      .getByRole("button", {
        name: "Revoke OAuth Synthetic OAuth assistant",
        exact: true,
      })
      .click();
    await expect(
      owner.getByText("Revoked Synthetic OAuth assistant.", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await remote.request.get("/api/mcp", {
          headers: { authorization: `Bearer ${rotated.access_token}` },
        })
      ).status(),
    ).toBe(401);
  } finally {
    await owner.unroute(`${callback}**`);
    if (viewport) await owner.setViewportSize(viewport);
    await remote.close();
  }
}
