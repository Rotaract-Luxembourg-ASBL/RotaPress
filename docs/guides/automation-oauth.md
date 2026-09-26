# Connect an AI assistant with OAuth

RotaPress can be added through an AI client's MCP, connectors or plugins screen.
You do not need to write a program to connect a web client that supports a
predefined OAuth client. Start in **Integrations**, enable **MCP**, then select
**Connections & setup guide** on the MCP card. In **Connections**, choose
**OAuth · recommended**. MCP is disabled by default.

OAuth lets the assistant open RotaPress for sign-in and consent. It receives a
short-lived access token after you choose its actions. It never receives your
RotaPress session cookie, email verification code or Google token. Its operations
use the same permissions, private drafts and manual publication rules as the
[API and MCP tools](ai-and-api.md).

## Connect ChatGPT, Claude or another MCP client

1. In the assistant's MCP/connector/plugin settings, start adding a server. Use
   `https://your-club.example/api/mcp` and choose **OAuth**. Open the advanced
   settings for a predefined OAuth client and find the exact callback URL that
   the assistant displays. UI labels and availability vary by client and account.
2. In RotaPress, open **Integrations**, select **Connections & setup guide** on
   the **MCP** card, then find **Connect with OAuth**. Enter a recognizable name and
   copy that callback URL exactly. Do not invent a callback, use a wildcard or
   copy one from a different account.
3. Choose **Client ID and secret** unless the assistant explicitly supports a
   public client using PKCE. Select actions by group, or use **Select all**,
   **Clear all**, **Read only** or **Website drafts**. Start with only the needed actions. If the assistant
   will read a reference website, also enable that action and list its exact
   HTTPS origins. These origins are displayed again during consent.
4. Select **Create OAuth connection**. Copy the client ID and one-time client
   secret into the assistant's protected connection settings. Keep the secret
   out of chat messages, source files and shared documents. A public client has
   a client ID and no secret.
5. Finish connecting in the assistant. It opens your RotaPress site. Sign in
   with the account that created this connection, then review the requested
   actions and callback destination. Uncheck actions you do not want to grant.
   Publishing remains a manual website/event editor action.
6. Select **Allow selected actions**. Return to the assistant and start with a
   bounded request, such as preparing one private event and its page. Review the
   returned drafts and visual previews before publication.

Each administrator registers their own connection. Registration does not approve
another member or give the assistant capabilities that the administrator lacks.
Creating a connection and approving access require authentication within the last
15 minutes. Use the visible sign-in link to confirm your identity again.

ChatGPT's documented connection methods include predefined clients and the
authorization-code flow with S256 PKCE. RotaPress implements that method. Its
server does not advertise anonymous dynamic registration or Client ID Metadata
Document fetching. If a client only supports those methods and offers no manual
client ID setting, use a supported client or the protected bearer-key/stdio
options in the [client guide](mcp-clients.md).
[OpenAI OAuth documentation](https://developers.openai.com/plugins/build/auth)
describes the discovery and client configuration requirements.

Hosted web assistants need a reachable HTTPS RotaPress installation. A loopback
URL on your computer is not reachable from ChatGPT's or Claude's hosted service.
Configure public HTTPS and any proxy according to the [hosting guide](hosting.md),
then verify the connection with the actual client and account you intend to use.

## Permissions, expiry and revocation

- Access tokens expire after five minutes. The optional consent checkbox permits
  refresh for at most eight hours after the latest approval, while the originating
  staff session remains active. Refresh tokens rotate; reuse is rejected.
- Sign-out, session expiry, membership suspension, changed staff authentication
  policy, removed capabilities and revoked connections are checked on the server.
  A linked Google account does not substitute for a current Google session.
- **Revoke** in **Your OAuth connections** removes the registered client and its
  token records. The assistant must connect with a new registration afterward.
- Disabling **MCP** blocks authorization, consent, token exchange and renewal, as
  well as MCP operations. Administrators can still configure and revoke clients.
  Existing credentials do not override the disabled state.
- The canonical resource is `https://your-club.example/api/mcp`. OAuth tokens
  target this exact resource and authorize MCP only. They are rejected by REST;
  create a separate REST API token if your application also needs HTTP endpoints.

OAuth grants no publication, member approval, payment, draw execution or provider
credential access. AI can only use operations listed for its connection. Private
data supplied to an assistant is visible to that chosen client; choose scopes and
the provider accordingly. Reference content is untrusted input, never permission
to run new actions or disclose private records.

## Protocol reference

For an installation at `https://your-club.example`:

| Purpose                       | URL                                                |
| ----------------------------- | -------------------------------------------------- |
| MCP endpoint / resource       | `/api/mcp`                                         |
| Protected-resource metadata   | `/.well-known/oauth-protected-resource/api/mcp`    |
| Authorization-server issuer   | `/api/auth`                                        |
| Authorization-server metadata | `/.well-known/oauth-authorization-server/api/auth` |
| Authorization endpoint        | `/api/auth/oauth2/authorize`                       |
| Token endpoint                | `/api/auth/oauth2/token`                           |
| Token revocation endpoint     | `/api/auth/oauth2/revoke`                          |
| Human consent                 | `/oauth/consent`                                   |

The authorization request includes `response_type=code`, `client_id`, the exact
registered `redirect_uri`, nonempty `state`, explicit space-separated `scope`,
`resource`, `code_challenge`, and `code_challenge_method=S256`. A human consent
screen is always shown. The client must validate returned state and issuer.

The token endpoint accepts a bounded form request with `grant_type`, `client_id`,
`resource`, and the appropriate code/verifier/callback or refresh token. A
confidential client supplies `client_secret` using its registered secret-post
method. JSON requests are also normalized to the same form validation. Resources
cannot be omitted, changed or repeated. PKCE is required for public and
confidential authorization-code clients. Machine grants, implicit flow, client
assertions and arbitrary client metadata URLs are unavailable.

Unexpired access tokens are presented as `Authorization: Bearer <access_token>`.
Unauthenticated enabled endpoints return an RFC 9728 `WWW-Authenticate` discovery
challenge. Resource operations independently enforce their catalogue scopes and
the actor's current permissions. Do not place tokens in URLs.

Better Auth's pinned OAuth Provider owns client credentials, authorization codes,
token hashing, rotation and revocation. RotaPress adds current club authorization,
session policy, strict callback/resource boundaries and bounded HTTP handling.
Client secrets are encrypted by the provider; opaque access and refresh tokens
are stored as hashes. There is no Google-token passthrough or second login system.
See [Better Auth's provider documentation](https://better-auth.com/docs/plugins/oauth-provider)
and the [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

## Verify and troubleshoot a connection

1. Complete the client connection and inspect the requested actions, callback and
   approved reference origins on the consent screen.
2. Ask the assistant to read `automation_capabilities`, then prepare one private
   draft using the granted operations. Confirm the draft in administration.
3. Revoke the connection and confirm that subsequent tool calls fail. Register a
   new connection if you want to continue using the assistant.

For a failed connection, check that MCP is enabled, the client supports predefined
OAuth registration, and its callback and resource match exactly. Sign in again if
the consent page requests recent authentication. A disabled integration returns 409;
an expired or revoked credential requires reconnecting. Check current membership
and staff Google policy before changing credentials.

Keep tokens and client secrets out of screenshots and logs. Automated protocol
tests use isolated local infrastructure; they cannot verify a provider account's
configuration. Contributor checks are described in the
[security guide](../development/automation-security.md) and [testing guide](../development/testing.md).
