/** Reviewed provider defaults. Account-specific callbacks always remain editable. */
export const oauthClientPresets = {
  chatgpt: {
    label: "ChatGPT",
    name: "ChatGPT club assistant",
    // Requires matching issuer metadata and RFC 9207 support; checked in B01.
    redirects: "https://chatgpt.com/connector_platform_oauth_redirect",
    reference: "https://developers.openai.com/plugins/build/auth#redirect-url",
    instructions:
      "In ChatGPT, create an MCP app in Plugins. Enter the server URL, choose OAuth, then paste the client ID and secret into Advanced OAuth settings.",
  },
  claude: {
    label: "Claude (web or desktop connector)",
    name: "Claude club assistant",
    redirects: "https://claude.ai/api/mcp/auth_callback",
    reference:
      "https://docs.cloud.google.com/mcp/configure-mcp-ai-application#claude.ai",
    instructions:
      "In Claude, open Settings → Connectors → Add custom connector. Enter the server URL, then paste the client ID and secret into Advanced settings.",
  },
  custom: {
    label: "Other app · manual setup",
    name: "AI club assistant",
    redirects: "",
    reference: "",
    instructions:
      "In your app's MCP connection settings, enter the server URL and choose OAuth. Paste the client ID and, when required, the client secret into its protected settings.",
  },
} as const;

export type OAuthPlatform = keyof typeof oauthClientPresets;
export type OAuthSetup = {
  name: string;
  redirects: string;
  authentication: "client_secret_post" | "none";
};

export function defaultOAuthSetup(platform: OAuthPlatform): OAuthSetup {
  const preset = oauthClientPresets[platform];
  return {
    name: preset.name,
    redirects: preset.redirects,
    authentication: "client_secret_post",
  };
}
