import { expect, type Page } from "@playwright/test";

/** Hold only the Google-start response; no provider navigation or identity is simulated. */
export async function signInGooglePendingJourney(visitor: Page) {
  await visitor.goto("/sign-in?next=/membership");
  const main = visitor.getByRole("main");
  const google = main.getByRole("button", {
    name: "Sign in with Google",
    exact: true,
  });
  const email = main.getByRole("button", {
    name: "Send verification code",
    exact: true,
  });
  await expect(google).toBeEnabled();
  await expect(email).toBeEnabled();
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const endpoint = "**/api/auth/sign-in/social";
  await visitor.route(endpoint, async (route) => {
    await held;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "GOOGLE_UNAVAILABLE",
        message: "Google sign-in could not start. Please try again.",
      }),
    });
  });
  try {
    await google.click();
    await expect(
      main.getByRole("button", { name: "Opening Google…", exact: true }),
    ).toBeDisabled();
    await expect(email).toBeDisabled();
    await expect(main.getByRole("status")).toContainText(
      "Opening Google sign-in…",
    );
    release();
    await expect(main.getByRole("alert")).toContainText(
      "Google sign-in could not start",
    );
    await expect(google).toBeEnabled();
    await expect(email).toBeEnabled();
  } finally {
    release();
    await visitor.unroute(endpoint);
  }
}

/** Real Better Auth state/cookie recovery on loopback; no Google request or code exchange. */
export async function signInRecoveryJourney(visitor: Page) {
  const viewport = visitor.viewportSize();
  const cases = [
    {
      name: "member",
      returnTo: "/membership",
      reauth: false,
      heading: "Sign in to your club account",
    },
    {
      name: "mcp-review",
      returnTo: "/admin/integrations/automation/authorize",
      reauth: false,
      heading: "Sign in to connect",
    },
    {
      name: "reauth",
      returnTo: "/admin/integrations/mcp",
      reauth: true,
      heading: "Confirm it's you",
    },
    {
      name: "mcp-reauth",
      returnTo: "/admin/integrations/automation/authorize",
      reauth: true,
      heading: "Confirm it's you",
    },
  ];
  try {
    for (const scenario of cases) {
      const query = new URLSearchParams({ next: scenario.returnTo });
      if (scenario.reauth) query.set("reauth", "1");
      await visitor.goto(`/sign-in?${query.toString()}`);
      const recovered = await visitor.evaluate(async ({ returnTo, reauth }) => {
        const recovery = new URL("/sign-in", location.origin);
        recovery.searchParams.set("next", returnTo);
        if (reauth) recovery.searchParams.set("reauth", "1");
        const response = await fetch("/api/auth/sign-in/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "google",
            callbackURL: returnTo,
            errorCallbackURL: recovery.pathname + recovery.search,
            disableRedirect: true,
          }),
          redirect: "manual",
        });
        const result = (await response.json()) as {
          url?: unknown;
          redirect?: unknown;
        };
        if (!response.ok || typeof result.url !== "string") return false;
        const provider = new URL(result.url);
        const state = provider.searchParams.get("state");
        if (
          result.redirect !== false ||
          provider.origin !== "https://accounts.google.com" ||
          !state
        )
          return false;
        // State and provider URL never leave this browser closure. access_denied
        // is handled before token exchange by the actual pinned library callback.
        const callback = new URL("/api/auth/callback/google", location.origin);
        callback.searchParams.set("state", state);
        callback.searchParams.set("error", "access_denied");
        const rejected = await fetch(callback, { redirect: "follow" });
        const returned = new URL(rejected.url);
        const matches =
          rejected.ok &&
          returned.origin === location.origin &&
          returned.pathname === "/sign-in" &&
          returned.searchParams.get("next") === returnTo &&
          returned.searchParams.get("reauth") === (reauth ? "1" : null) &&
          returned.searchParams.get("error") === "access_denied";
        if (matches) location.assign(returned.href);
        return matches;
      }, scenario);
      expect(recovered).toBe(true);
      const main = visitor.getByRole("main");
      await expect(
        main.getByRole("heading", {
          level: 1,
          name: scenario.heading,
          exact: true,
        }),
      ).toBeVisible();
      await expect(visitor.getByRole("heading", { level: 1 })).toHaveCount(1);
      if (scenario.name === "mcp-reauth") {
        await expect(
          main.getByText("AI connection", { exact: true }),
        ).toBeVisible();
        await expect(
          main.getByText(
            "Confirm your identity before reviewing the new access requested by your AI app. You choose which actions to allow.",
            { exact: true },
          ),
        ).toBeVisible();
      }
      await expect(main.getByRole("alert")).toContainText(
        "Google sign-in did not finish. Start again with an allowed Google account.",
      );
      await expect(
        main.getByRole("button", { name: "Sign in with Google", exact: true }),
      ).toBeEnabled();
      for (const width of [1440, 390]) {
        await visitor.setViewportSize({ width, height: 900 });
        expect(
          await visitor.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await visitor.screenshot({
          path: `.local/feedback-captures/sign-in-recovery-${scenario.name}-${width}.png`,
          fullPage: true,
        });
      }
    }
  } finally {
    if (viewport) await visitor.setViewportSize(viewport);
    await visitor.goto("/sign-in?next=/membership");
  }
}
