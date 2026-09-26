# Connect an AI assistant with OAuth

RotaPress can be added through an AI client's MCP, connectors or plugins screen.
You do not need to write a program to connect a web client that supports a
predefined OAuth client. Start in **Integrations**, enable **MCP**, then select
**Connections & setup guide** on the MCP card. In **Connections**, choose
**OAuth · recommended**. MCP is disabled by default.

OAuth lets the assistant open RotaPress for sign-in and consent. It receives a
short-lived access token after you choose its actions. It never receives your
RotaPress session cookie, email verification code or Google token. Its operations
use the same permissions, private drafts and deliberate publication rules as the
[API and MCP tools](ai-and-api.md).

## Connect ChatGPT, Claude or another MCP client

1. In RotaPress, open **Integrations → MCP → Connections → OAuth**.
   Choose your **AI app**: **ChatGPT** or **Claude (web or desktop connector)**.
   RotaPress fills in a connection name, the documented callback and client
   authentication. You can rename the connection without changing those settings.
2. For another client, choose **Other app · manual setup**. **Advanced connection
   settings** opens for its exact callback URL and authentication method. The same
   section lets you override a preset if your account displays a different callback.
   Use **Client ID and secret** unless the app explicitly supports a public PKCE
   client. Wildcards are not supported.
3. Select actions by group, or use **Select all**,
   **Clear all**, **Read only** or **Website drafts**. Start with only the needed actions. If the assistant
   will read a reference website, also enable that action and list its exact
   HTTPS origins. These origins are displayed again during consent.
4. Select **Create OAuth connection**. Follow **Finish connecting** to copy the
   server URL, client ID and one-time secret into the assistant. In ChatGPT,
   create an MCP app, choose OAuth and enter the credentials under **Advanced OAuth
   settings**. In Claude, add a custom connector and use **Advanced settings**.
   Keep the secret out of chat messages, source files and shared documents. A public client has
   a client ID and no secret.
5. Finish connecting in the assistant. It opens your RotaPress site. Sign in
   with the account that created this connection, then review the requested
   actions and callback destination. Uncheck actions you do not want to grant.
   **Keep connected** is selected by default so the app can renew access without
   repeated sign-in. Uncheck it if you only want a short connection without renewal.
   Publication has separate actions: grant them only if you want to request
   publication through this assistant. Draft-writing permission alone cannot publish.
6. Select **Allow selected actions**. Return to the assistant and start with a
   bounded request, such as preparing one private event and its page. Review the
   returned drafts and visual previews before publication.

Each administrator registers their own connection. Registration does not approve
another member or give the assistant capabilities that the administrator lacks.
Creating a connection, approving it for the first time or approving broader grants
requires authentication within the last 15 minutes. Reusing the same or narrower
approval uses your current valid staff session without asking you to sign in again
just because 15 minutes have passed. A sign-in link appears when authentication
needs renewal, with an explanation of why.

### Automatic settings and manual overrides

| AI app                       | Callback filled by RotaPress                            |
| ---------------------------- | ------------------------------------------------------- |
| ChatGPT                      | `https://chatgpt.com/connector_platform_oauth_redirect` |
| Claude web/desktop connector | `https://claude.ai/api/mcp/auth_callback`               |

The ChatGPT default relies on RotaPress's matching issuer metadata and issuer
identification support, as described in the
[OpenAI OAuth guide](https://developers.openai.com/plugins/build/auth#redirect-url).
The Claude callback is documented in the
[Google Cloud MCP client setup guide](https://docs.cloud.google.com/mcp/configure-mcp-ai-application#claude.ai).

These are maintained presets, not discovery of every AI platform. Some clients use
account-specific callbacks or a local port chosen by the client. Use the exact value
that client supplies under **Advanced connection settings**. Claude Code, Codex CLI
and other native clients must use their own callback or the [MCP access-key setup](mcp-clients.md).
Switching AI apps retains each app's unsaved settings while this screen stays open.
**Restore app defaults** resets the selected app's callback and authentication only.
An existing registered connection keeps its callbacks until revoked and replaced;
updating a preset does not silently change existing credentials.

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

- A client that omits `scope` requests the actions selected when its connection
  was registered. These appear on the consent screen, where you can narrow them.
  An explicitly requested subset stays narrow. Empty or repeated scope parameters
  are rejected. RotaPress no longer forces every new connection to request only
  website reading.
- Existing connections retain their original allowed actions. To add publication,
  calendar management, website settings or other new actions, create a connection with those
  actions and reconnect the assistant. Check `automation_capabilities` afterward.
- Access tokens expire after five minutes. With **Keep connected**, the client
  renews them using rotating refresh tokens instead of asking you to connect
  again. Refresh tokens last up to seven days and require the originating staff
  session to remain active; consent has no separate eight-hour cutoff.
- **Keep connected** is selected by default and can be declined. It adds only the
  renewal permission (`offline_access`), including when the client omitted that
  permission; it never adds website, calendar, publication or other actions.
- Better Auth remembers approved actions for the same client and resource.
  RotaPress does not force a fresh consent screen for the same or narrower grant.
  First approval or broader permissions still need recent sign-in and approval;
  a client can explicitly request the consent screen again.
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

Publication requires the relevant `website:publish`, `calendar:publish`,
`forms:publish`, `events:publish` or `directory:publish` grant, plus your explicit
request for the target saved revision/version. Each publication call requires
`confirmed: true` and current server authorization. Keep client approval enabled:
the server cannot verify a human chat request from a model-supplied boolean.
See [publication workflow and effects](ai-and-api.md#publish-only-when-requested).

OAuth grants no member approval, payment, draw execution, media visibility changes
or provider credential access. AI can only use operations listed for its connection. Private
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
registered `redirect_uri`, nonempty `state`, `resource`, `code_challenge`, and
`code_challenge_method=S256`. The optional space-separated `scope` selects a subset
of the registered actions; omitting it uses the registered defaults. RotaPress
offers `offline_access` for the visible **Keep connected** choice without expanding
application actions. Better Auth can reuse remembered consent for the same client,
actions and resource; RotaPress does not force `prompt=consent`. The client must
validate returned state and issuer.

The token endpoint accepts a bounded form request with `grant_type`, `client_id`,
`resource`, and the appropriate code/verifier/callback or refresh token. A
confidential client supplies `client_secret` using its registered secret-post
method. JSON requests are also normalized to the same form validation. Initial
authorization and code exchange require the explicit canonical resource. A refresh
request may omit `resource`; it defaults only to this installation's fixed MCP
endpoint. An explicit wrong or repeated resource is rejected. PKCE is required for public and
confidential authorization-code clients. Machine grants, implicit flow, client
assertions and arbitrary client metadata URLs are unavailable.

Keep the replacement refresh token returned by each successful renewal. The
provider allows a ten-second retry grace for the same client, scopes and resource
when a refresh response is lost; it returns the same issued response. Later reuse
of an old refresh token is rejected. The grace cannot extend grants or bypass
session, consent or revocation checks.

Unexpired access tokens are presented as `Authorization: Bearer <access_token>`.
Unauthenticated enabled endpoints return an RFC 9728 `WWW-Authenticate` discovery
challenge. Resource operations independently enforce their catalogue scopes and
the actor's current permissions. Do not place tokens in URLs.

The initial challenge and protected-resource metadata omit a global scope list
because available actions depend on the registered connection. Supported scopes
remain documented in authorization-server metadata. This follows the
[MCP scope selection strategy](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#scope-selection-strategy)
and the authorization server's registered client defaults; it never expands a
client's stored permission limit.

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
OAuth registration, and its callback and resource match exactly. A disabled
integration returns 409. A five-minute access-token expiry should use refresh
when **Keep connected** was approved. Reconnect if renewal was declined, the
refresh token expired, the originating session ended, or access was revoked.
Check current membership and staff Google policy before replacing credentials.

Repeated prompts can come from different places:

- **RotaPress sign-in** means a valid current staff session is needed.
- **RotaPress consent** approves actions and renewal for the registered app.
  Unchanged consent can be remembered; adding grants still requires approval.
- **ChatGPT/Claude connection or tool approval** is controlled by that app.
  RotaPress token renewal does not suppress those prompts. In particular,
  publication-tool approval is separate from authentication and should stay enabled.

If the AI app asks to reconnect after every action, confirm that **Keep connected**
was approved and that the app stores and uses the latest rotated refresh token.
For an older connection created without renewal, reconnect it once and approve
that option. Previously expired or revoked refresh tokens can also need one
reconnection after an update. Reuse the existing client ID and secret while its
registration is still active; ordinary renewal does not require creating a new
OAuth connection. Normal tool calls should not need a new OAuth browser flow.

If opening the connection displays `Cross-origin access is not allowed.` before
sign-in or consent, the installation is blocking the incoming browser navigation.
Update the application and check any additional proxy rules: top-level GET
navigation must reach `/api/auth/oauth2/authorize` and its signed handoff at
`/api/automation/oauth/sign-in`. Keep cross-site API requests and account mutations
protected; changing the callback or adding reference websites does not fix this error.

Keep tokens and client secrets out of screenshots and logs. Automated protocol
tests use isolated local infrastructure; they cannot verify a provider account's
configuration. Contributor checks are described in the
[security guide](../development/automation-security.md) and [testing guide](../development/testing.md).
