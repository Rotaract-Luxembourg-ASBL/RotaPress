import { expect, type Browser, type Page } from "@playwright/test";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import type { Pool } from "pg";

/** B01 continuation: real OTP owner, synthetic credentials, no Google requests. */
export async function googleAuthJourney(
  owner: Page,
  browser: Browser,
  database: Pool,
) {
  const endpoint = "/api/admin/integrations/google";
  const clientId = "123456789012-synthetic-browser.apps.googleusercontent.com";
  const context = await browser.newContext();
  const visitor = await context.newPage();
  const viewport = owner.viewportSize();
  const connection = owner.getByRole("region", {
    name: "Saved Google connection",
    exact: true,
  });
  const secret = owner.locator('input[type="password"]');
  async function confirm(name: string) {
    const dialog = owner.getByRole("dialog", { name, exact: true });
    const button = dialog.getByRole("button", { name, exact: true });
    await expect(button).toBeDisabled();
    await dialog
      .getByRole("checkbox", {
        name: "I understand the change and its effect on Google sessions.",
        exact: true,
      })
      .check();
    await button.click();
    await expect(dialog).toHaveCount(0);
  }
  async function settings(configured: boolean, enabled: boolean) {
    const response = await owner.request.get(endpoint);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const value = (await response.json()) as Record<string, unknown>;
    // Only keys and booleans reach assertion output; never print credential values.
    expect(Object.keys(value).sort()).toEqual(
      [
        "callbackUrl",
        "canManage",
        "clientId",
        "configured",
        "enabled",
        "encryptionReady",
        "hasSecret",
        "hostedDomain",
        "origin",
        "staffRequiresGoogle",
        "verifiedAt",
        "version",
      ].sort(),
    );
    expect(
      value.configured === configured && value.hasSecret === configured,
    ).toBe(true);
    expect(value.enabled === enabled && value.verifiedAt === null).toBe(true);
    expect(value.clientId === (configured ? clientId : "")).toBe(true);
    expect(
      value.callbackUrl === `${smokeOrigin}/api/auth/callback/google`,
    ).toBe(true);
    expect(value.origin === smokeOrigin).toBe(true);
    expect(
      value.canManage === true && value.staffRequiresGoogle === false,
    ).toBe(true);
  }
  async function publicAvailability(enabled: boolean) {
    const response = await visitor.request.get("/api/me");
    expect((await response.json()).googleConfigured === enabled).toBe(true);
    const loaded = visitor.waitForResponse(
      (result) => new URL(result.url()).pathname === "/api/me" && result.ok(),
    );
    await visitor.goto("/sign-in");
    await loaded;
    await expect(
      visitor.getByRole("button", {
        name: "Send verification code",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      visitor.getByRole("button", {
        name: "Sign in with Google",
        exact: true,
      }),
    ).toHaveCount(enabled ? 1 : 0);
  }
  const social = {
    provider: "google",
    callbackURL: "/admin/integrations/google",
    disableRedirect: true,
  };
  try {
    expect((await visitor.request.get(endpoint)).status()).toBe(401);
    await owner.goto("/admin/integrations");
    const card = owner.getByRole("article", {
      name: "Google sign-in",
      exact: true,
    });
    await expect(
      card.getByText("Not configured", { exact: true }),
    ).toBeVisible();
    for (const [device, width] of [
      ["desktop", 1440],
      ["phone", 390],
    ] as const) {
      await owner.setViewportSize({ width, height: 1000 });
      expect(
        await owner.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await card.screenshot({
        path: `.local/google-integration-card-${device}.png`,
      });
    }
    if (viewport) await owner.setViewportSize(viewport);
    await card
      .getByRole("link", { name: "Set up Google sign-in", exact: true })
      .click();
    await expect(owner).toHaveURL(/\/admin\/integrations\/google$/);
    await expect(connection.locator(".status-badge")).toHaveText(
      "Not configured",
    );
    await owner.getByLabel("Google client ID", { exact: true }).fill(clientId);
    // Generate and enter the synthetic secret inside the browser, outside Playwright arguments.
    await owner.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>(
        'input[type="password"]',
      );
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!input || !setter)
        throw new Error("Google credential input is unavailable.");
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      setter.call(
        input,
        `GOCSPX-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await owner
      .getByRole("button", { name: "Review and save credentials", exact: true })
      .click();
    await confirm("Save credentials disabled");
    expect((await secret.inputValue()) === "").toBe(true);
    await settings(true, false);
    await publicAvailability(false);
    await owner
      .getByRole("button", { name: "Review enabling Google", exact: true })
      .click();
    await confirm("Enable Google sign-in");
    await settings(true, true);
    await publicAvailability(true);

    // Parse the real library response locally; OAuth state and the URL never leave this closure.
    const redirect = await visitor.evaluate(async (body) => {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "manual",
      });
      const result = (await response.json()) as {
        url?: unknown;
        redirect?: unknown;
      };
      if (typeof result.url !== "string") return { generated: false };
      const url = new URL(result.url);
      const scopes = (url.searchParams.get("scope") ?? "")
        .split(" ")
        .filter(Boolean)
        .sort();
      return {
        generated: response.ok && result.redirect === false,
        google:
          url.protocol === "https:" && url.hostname === "accounts.google.com",
        callback:
          url.searchParams.get("redirect_uri") ===
          `${location.origin}/api/auth/callback/google`,
        scopes:
          JSON.stringify(scopes) ===
          JSON.stringify(["email", "openid", "profile"]),
        state: Boolean(url.searchParams.get("state")),
        pkce:
          Boolean(url.searchParams.get("code_challenge")) &&
          url.searchParams.get("code_challenge_method") === "S256",
        // This pinned Google provider does not require an ID-token nonce in redirect flows.
        nonce:
          !url.searchParams.has("nonce") ||
          Boolean(url.searchParams.get("nonce")),
        noSecret: !url.searchParams.has("client_secret"),
      };
    }, social);
    expect(redirect).toEqual({
      generated: true,
      google: true,
      callback: true,
      scopes: true,
      state: true,
      pkce: true,
      nonce: true,
      noSecret: true,
    });
    for (const override of [
      { idToken: { token: "invalid-synthetic-token" } },
      { scopes: ["https://www.googleapis.com/auth/drive"] },
      { additionalData: { serverContext: { googleAuthVersion: "forged" } } },
      { serverContext: { googleAuthVersion: "forged" } },
    ]) {
      const rejected = await visitor.request.post("/api/auth/sign-in/social", {
        headers: { origin: smokeOrigin },
        data: { ...social, ...override },
      });
      expect(rejected.status() >= 400 && rejected.status() < 500).toBe(true);
    }
    // No authorization code: rejection cannot reach Google's token exchange.
    const callback = await visitor.request.get(
      "/api/auth/callback/google?state=invalid-synthetic-state&error=access_denied",
      { maxRedirects: 0 },
    );
    expect(callback.status() >= 300 && callback.status() < 400).toBe(true);
    const errorDestination = new URL(
      callback.headers().location ?? "",
      smokeOrigin,
    );
    expect(
      errorDestination.origin === smokeOrigin &&
        errorDestination.searchParams.has("error"),
    ).toBe(true);
    await settings(true, true);
    expect((await visitor.request.get(endpoint)).status()).toBe(401);
    await expect(
      connection.getByText("Not yet verified", { exact: true }),
    ).toBeVisible();
    for (const [device, width] of [
      ["desktop", 1440],
      ["phone", 390],
    ] as const) {
      await owner.setViewportSize({ width, height: 1000 });
      expect((await secret.inputValue()) === "").toBe(true);
      expect(
        await owner.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await owner.screenshot({
        path: `.local/google-auth-${device}.png`,
        fullPage: true,
        mask: [owner.locator(".admin-account")],
      });
    }
    // Policy fixture only: no Google identity/session or live callback is fabricated.
    await database.query(
      "UPDATE club.organization SET staff_auth_policy = 'google'",
    );
    try {
      for (const width of [1440, 390]) {
        await visitor.setViewportSize({ width, height: 900 });
        await visitor.goto("/sign-in?next=/admin");
        await expect(
          visitor.getByRole("heading", { name: "Welcome to your workspace" }),
        ).toBeVisible();
        await expect(
          visitor.getByRole("button", {
            name: "Sign in with Google",
            exact: true,
          }),
        ).toBeVisible();
        await expect(visitor.getByLabel("Email address")).toHaveCount(0);
        expect(
          await visitor.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await visitor.screenshot({
          path: `.local/feedback-captures/workspace-${width}.png`,
          fullPage: true,
        });
      }
      await visitor.goto("/sign-in?next=/membership");
      await expect(visitor.getByLabel("Email address")).toBeVisible();
      expect((await owner.request.get("/api/admin/settings")).status()).toBe(
        403,
      );
    } finally {
      await database.query(
        "UPDATE club.organization SET staff_auth_policy = 'email-or-google'",
      );
    }
    await owner
      .getByRole("button", { name: "Review disabling Google", exact: true })
      .click();
    await confirm("Disable Google sign-in");
    await settings(true, false);
    await publicAvailability(false);
    const disabled = await visitor.request.post("/api/auth/sign-in/social", {
      headers: { origin: smokeOrigin },
      data: social,
    });
    expect(disabled.status() >= 400 && disabled.status() < 500).toBe(true);
    await owner
      .locator("summary")
      .filter({ hasText: /^Connection actions$/ })
      .click();
    await owner
      .getByRole("button", { name: "Review removing credentials", exact: true })
      .click();
    await confirm("Remove Google credentials");
    await settings(false, false);
    await publicAvailability(false);
    const disconnected = await visitor.request.post(
      "/api/auth/sign-in/social",
      { headers: { origin: smokeOrigin }, data: social },
    );
    expect(disconnected.status() >= 400 && disconnected.status() < 500).toBe(
      true,
    );
    expect((await owner.request.get("/api/admin/members")).status()).toBe(200);
    const session = await owner.request.get("/api/auth/get-session");
    expect((await session.json()).session.authMethod === "email-otp").toBe(
      true,
    );
    await owner.goto("/admin");
    await expect(owner).toHaveURL(/\/admin$/);
  } finally {
    if (viewport) await owner.setViewportSize(viewport);
    await context.close();
  }
}
