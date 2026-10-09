import { createHash, randomBytes } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import type { Pool } from "pg";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { capture } from "./integration-credentials-journey";
import { oauthPresetsJourney } from "./oauth-presets-journey";
import { oauthWebsiteRecreationJourney } from "./oauth-website-recreation-journey";
import { openOAuthFromAssistant } from "./oauth-navigation-journey";
import { oauthManagementJourney } from "./oauth-management-journey";
import {
  oauthConnectionsJourney,
  revokeOAuthConnection,
} from "./oauth-connections-journey";

async function captureConsent(page: Page, path: string) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path, fullPage: true });
}

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
    await oauthWebsiteRecreationJourney(owner);
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
      "Read approved reference websites",
    ])
      await picker.getByRole("checkbox", { name, exact: true }).check();
    await panel
      .getByLabel("Reference website domains", { exact: true })
      .fill("rotaract.lu\nhttps://assets.example.org");
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
      scope: "website:read",
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
    // Retain the provider-signed request through the actual recovery endpoint.
    // The owner keeps the already authenticated local fixture session.
    const signedQuery = new URL(owner.url()).search;
    await owner.goto(`/api/automation/oauth/sign-in${signedQuery}`);
    await expect(owner).toHaveURL(
      `${smokeOrigin}/sign-in?reauth=1&next=/admin/integrations/automation/authorize`,
    );
    await owner.goto("/admin/integrations/automation/authorize");
    await expect(
      owner.getByRole("heading", {
        name: "Allow Synthetic OAuth assistant to help your club?",
        exact: true,
      }),
    ).toBeVisible();
    await expect(owner.getByRole("main")).toHaveCount(1);
    await expect(owner.locator("#main-content")).toHaveCount(1);
    await expect(owner.locator(".admin-layout")).toHaveCount(0);
    await expect(
      owner.getByRole("navigation", { name: "Administration", exact: true }),
    ).toHaveCount(0);
    await expect(owner.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(
      owner
        .getByRole("list", { name: "Connection progress", exact: true })
        .locator('[aria-current="step"]'),
    ).toContainText("Review access");
    await expect(owner.locator(".oauth-consent-account strong")).toBeVisible();
    await expect
      .poll(() =>
        owner
          .locator(".oauth-consent-account strong")
          .evaluate(
            (identity) =>
              identity.getBoundingClientRect().bottom + window.scrollY,
          ),
      )
      .toBeLessThanOrEqual(900);
    await expect(
      owner.getByRole("group", { name: "Website", exact: true }),
    ).toBeVisible();
    await expect(
      owner.getByRole("checkbox", {
        name: "Read website content",
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      owner.getByText("The app requested 1 of 9 allowed actions.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      owner.getByRole("complementary", {
        name: "Permission request",
        exact: true,
      }),
    ).toContainText("The app requested read-only access");
    await expect(
      owner.getByText("1 action selected · Read-only access", { exact: true }),
    ).toBeVisible();
    const requestedRead = owner.getByRole("checkbox", {
      name: "Read website content",
      exact: true,
    });
    await requestedRead.focus();
    await requestedRead.press("Space");
    await expect(
      owner.getByRole("button", {
        name: "Allow selected actions",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      owner.getByText("0 actions selected", { exact: true }),
    ).toBeVisible();
    await requestedRead.press("Space");
    await expect(requestedRead).toBeChecked();
    await expect(
      owner.getByRole("complementary", {
        name: "Publication permissions",
        exact: true,
      }),
    ).toHaveCount(0);
    const returnDetails = owner.locator(".oauth-consent-destination details");
    await expect(returnDetails.locator("code")).toBeHidden();
    await returnDetails.locator("summary").focus();
    await returnDetails.locator("summary").press("Enter");
    await expect(returnDetails.locator("code")).toHaveText(callback);
    await returnDetails.locator("summary").press("Enter");
    await expect(returnDetails.locator("code")).toBeHidden();
    await expect(
      owner.getByRole("checkbox", {
        name: "Publish website content and settings on request",
        exact: true,
      }),
    ).toHaveCount(0);
    await captureConsent(
      owner,
      ".local/oauth-requested-permissions-desktop.png",
    );
    await owner.setViewportSize({ width: 390, height: 844 });
    await captureConsent(owner, ".local/oauth-requested-permissions-phone.png");
    await owner
      .getByRole("button", { name: "Review all allowed actions", exact: true })
      .click();
    await expect(
      owner.getByRole("checkbox", {
        name: "Publish website content and settings on request",
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      owner.getByRole("button", {
        name: "Review all allowed actions",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      owner.getByRole("group", { name: "Calendar", exact: true }),
    ).toBeVisible();
    await expect(
      owner.getByRole("complementary", {
        name: "Publication permissions",
        exact: true,
      }),
    ).toContainText("Publication needs your explicit request");
    const sourceCoverage = owner.getByRole("list", {
      name: "Reference website coverage",
      exact: true,
    });
    await expect(sourceCoverage).toContainText(
      "HTTPS rotaract.lu and all subdomains, including www.rotaract.lu",
    );
    await expect(sourceCoverage).toContainText("https://assets.example.org");
    await expect(sourceCoverage).toContainText("Exact HTTPS host only");
    if (viewport) await owner.setViewportSize(viewport);
    await captureConsent(
      owner,
      ".local/oauth-reviewed-permissions-desktop.png",
    );
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
    await captureConsent(owner, ".local/oauth-consent-phone.png");
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
        "UPDATE club.session SET created_at=now()-interval '13 hours' WHERE id=$1",
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
      await expect(
        owner.getByRole("button", {
          name: "Allow selected actions",
          exact: true,
        }),
      ).toBeDisabled();
      await expect(owner.locator(".oauth-consent-error")).toBeFocused();
      await expect(
        owner.getByRole("checkbox", {
          name: "Publish website content and settings on request",
          exact: true,
        }),
      ).toBeChecked();
    } finally {
      await database.query(
        "UPDATE club.session SET created_at=$2 WHERE id=$1",
        [session.id, originalSession.rows[0].created_at],
      );
    }
    // Reload consent details after restoring the current fixture identity.
    await owner.reload();
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
    reconnectParams.set("scope", tokens.scope);
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
    await oauthConnectionsJourney(owner, rotated.access_token);
    await revokeOAuthConnection(owner, "Synthetic OAuth assistant");
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
