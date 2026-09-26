import { expect, type Page } from "@playwright/test";
import { capture } from "./integration-credentials-journey";

/** Registers local clients only. No browser is sent to a real provider callback. */
export async function oauthPresetsJourney(owner: Page) {
  const endpoint = "/api/admin/integrations/automation/oauth";
  const panel = owner.getByRole("region", { name: "Connect with OAuth" });
  const app = panel.getByRole("combobox", { name: "AI app", exact: true });
  const callbacks = panel.getByRole("textbox", {
    name: "OAuth callback URLs",
    exact: true,
    includeHidden: true,
  });
  const advanced = panel.getByText("Advanced connection settings", {
    exact: true,
  });
  await expect(app).toHaveValue("chatgpt");
  await expect(callbacks).toBeHidden();
  await capture(owner, "mcp-platforms");
  await owner
    .context()
    .grantPermissions(["clipboard-write"], {
      origin: new URL(owner.url()).origin,
    });
  for (const [platform, name, redirect] of [
    [
      "chatgpt",
      "Synthetic ChatGPT preset",
      "https://chatgpt.com/connector_platform_oauth_redirect",
    ],
    [
      "claude",
      "Synthetic Claude preset",
      "https://claude.ai/api/mcp/auth_callback",
    ],
  ]) {
    await app.selectOption(platform);
    await panel.getByLabel("OAuth connection name", { exact: true }).fill(name);
    // Complete creation without opening Advanced or typing a callback/auth method.
    await expect(callbacks).toBeHidden();
    const created = owner.waitForResponse(
      (response) =>
        response.url().endsWith(endpoint) &&
        response.request().method() === "POST",
    );
    await panel
      .getByRole("button", { name: "Create OAuth connection", exact: true })
      .click();
    expect((await created).status()).toBe(200);
    await expect(
      panel.getByRole("heading", {
        name: `Finish connecting ${platform === "chatgpt" ? "ChatGPT" : "Claude"}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByLabel("OAuth client secret", { exact: true }),
    ).toHaveAttribute("type", "password");
    await panel
      .getByRole("button", { name: "Copy client ID", exact: true })
      .click();
    await expect(
      panel.getByText("OAuth client ID copied.", { exact: true }),
    ).toBeVisible();
    if (platform === "chatgpt") {
      const viewport = owner.viewportSize();
      const details = panel.locator(".oauth-issued");
      await details.screenshot({
        path: ".local/oauth-finish-desktop.png",
        mask: [details.locator("input")],
      });
      await owner.setViewportSize({ width: 390, height: 844 });
      expect(
        await owner.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await details.screenshot({
        path: ".local/oauth-finish-phone.png",
        mask: [details.locator("input")],
      });
      if (viewport) await owner.setViewportSize(viewport);
    }
    await panel
      .getByRole("button", { name: "I saved the OAuth details", exact: true })
      .click();
    await owner.reload();
    const saved = await owner.request.get(endpoint);
    const result = (await saved.json()) as {
      clients: {
        name: string;
        redirectUris: string[];
        authentication: string;
        scopes: string[];
      }[];
    };
    expect(result.clients.find((client) => client.name === name)).toMatchObject(
      {
        redirectUris: [redirect],
        authentication: "client_secret_post",
        scopes: ["website:read"],
      },
    );
    await panel
      .getByRole("button", { name: `Revoke OAuth ${name}`, exact: true })
      .click();
    await expect(
      panel.getByText(`Revoked ${name}.`, { exact: true }),
    ).toBeVisible();
  }
  await app.selectOption("chatgpt");
  await advanced.click();
  const customCallback =
    "https://chatgpt.com/connector/oauth/synthetic-account";
  await callbacks.fill(customCallback);
  await app.selectOption("claude");
  await app.selectOption("chatgpt");
  await panel
    .getByText("Advanced connection settings · customized", { exact: true })
    .click();
  await expect(callbacks).toHaveValue(customCallback);
  await panel
    .getByRole("button", { name: "Restore app defaults", exact: true })
    .click();
  await expect(callbacks).toHaveValue(
    "https://chatgpt.com/connector_platform_oauth_redirect",
  );
  await app.selectOption("custom");
  await expect(callbacks).toBeVisible();
  await expect(callbacks).toHaveValue("");
  // Submitting a closed Advanced section must expose and focus the missing field.
  await advanced.click();
  await panel
    .getByRole("button", { name: "Create OAuth connection", exact: true })
    .click();
  await expect(callbacks).toBeVisible();
  await expect(callbacks).toBeFocused();
}
