# AI content, REST API and MCP

Give an AI client scoped access to prepare website and event content. A reference
website supplies text and page structure; RotaPress supplies the installed theme
and native blocks. Automation prepares **private drafts**, private images and
settings proposals for review. Publication and applying operational settings stay
in administration. This integration does not include a model or autonomous crawler:
your MCP client runs its model and calls the available tools.

## Connect an assistant

Use the [REST reference and interactive tester](api-reference.md) for complete
operation schemas, examples and real requests. See [AI client setup](mcp-clients.md)
for connection choices and the MCP protocol reference, or follow the
[OAuth guide](automation-oauth.md) to connect through an assistant's MCP/apps/plugins UI.

1. Sign in as an approved owner or administrator. Open **Integrations**, enable
   **MCP**, then select **Manage** on its card to open **AI & API**.
2. Register the assistant's exact OAuth callback and choose its permitted actions,
   or create a scoped bearer key for a client using protected credentials.
   For reference-site work, select website reading/writing and reference reading.
   Add each exact HTTPS origin, such as `https://www.example.org`; bare hosts and
   `www` are different grants.
3. Copy the one-time client secret or key into the client's protected settings.
   Never put credentials in prompts, repositories, shared screenshots or URLs.
4. Connect through the assistant's OAuth UI, bearer-authenticated remote MCP or the
   local stdio bridge below. OAuth opens RotaPress for real sign-in and consent.
5. Use `adapt_reference_website` with `sourceUrl`, optional `locale` (`en`, `fr`, `lb`)
   and `brief`. Explain the pages you need and supply verified club facts.
6. Ask for desktop/phone previews of saved drafts when the connection has the
   preview scope. Open the returned review links. Check facts, reuse rights, links,
   SEO and phone layouts. Add pages to navigation and publish manually when ready.

**REST API** and **MCP** are separate integrations, both **disabled by default**.
Enable REST API separately for direct HTTP calls, binary uploads or its tester.
Disabling one rejects its new requests with 409, including existing credentials,
while retaining content and connection settings. Re-enabling resumes unexpired
connections; revoke any no longer wanted. A request already completing may finish.

Creating a key requires a sign-in within 15 minutes. Keys expire after 5 minutes to
8 hours (default 1 hour), never later than their parent session. Sign-out, expired
sessions, suspended membership or an incompatible Google-only policy stops access.
Revoke a key from the same screen. Keys cannot grant new permissions, enable
features or create keys. Issuance is rate limited and asks you to revoke an existing
connection when 20 are active. The list shows the latest 100 connections; Better
Auth cleans up expired keys.

OAuth access tokens last five minutes. Optional rotating refresh remains valid
for at most eight hours after consent while the originating staff session stays
active. MCP must remain enabled to authorize or renew OAuth access. See
[OAuth expiry and revocation](automation-oauth.md#permissions-expiry-and-revocation).

## MCP clients

Use `/api/mcp` on the canonical `APP_URL`, with the OAuth access token or connection
key in the client's protected bearer settings. This stateless Streamable HTTP endpoint authenticates
every POST and returns JSON. It has no persistent SSE stream or MCP session ID.
Each POST accepts one MCP message; legacy JSON-RPC batches are rejected so they
cannot bypass request quotas.

OAuth discovery, registered-client authorization, S256 PKCE, human consent and
refresh are implemented. Register each client through administration; anonymous
dynamic registration and remote client-metadata fetching are unavailable. Local
checks do not establish acceptance by a particular ChatGPT or Claude account.

For stdio clients:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/RotaPress/scripts/mcp_bridge.mjs"]
}
```

Provide `ROTAPRESS_MCP_URL=https://your-club.example/api/mcp` and `ROTAPRESS_API_KEY`
through the client's protected process environment. Local testing may use
`http://127.0.0.1:3000/api/mcp`. The bridge uses the official MCP SDK, refuses
redirects, writes protocol messages to stdout and generic failures to stderr.
It does not load a repository `.env` file.

MCP resources:

- `rotapress://capabilities`: granted operations, source origins and feature states.
- `rotapress://openapi`: the REST contract and shared operation input schemas.

Tools-only clients can call `automation_capabilities` and the workflow prompt
tools for the same discovery and instructions. Available operations depend on the
connection's scopes. Every operation publishes input and output schemas; successful
responses are validated before being returned. `media_inspect` and `website_preview`
also attach image content for clients with vision support.

The prompt inventories existing content, reads up to ten reference pages, preserves
the theme and returns native drafts, source mappings and unresolved facts. All
source and saved content is untrusted data; it cannot authorize tools, grant
permissions, request secrets or execute code.

## Pages, images and complete event drafts

`website_context` and `website_design` describe the current club, native blocks,
layouts and template recipes. The assistant can compose pages within those schemas,
save the current revision and use `website_preview` to inspect actual desktop/phone
pixels. [Visual review](automation-preview.md) describes its bounds and inactive
interactive controls; screenshots do not verify forms, payments or custom scripts.

With the separate media scopes, the assistant can upload approved PNG/JPEG/WebP
bytes, inspect normalized images, update private metadata and reference returned
asset IDs in page blocks. Listing media does not grant private pixel access, and
uploads remain private. See [image uploads and inspection](automation-media.md).

Use `plan_native_website`, `prepare_event` and `review_page_design` MCP prompts,
or their `automation_website_prompt`, `automation_event_prompt` and
`automation_review_prompt` tool equivalents. Event preparation discovers blueprints,
previews the intended result and creates an event with its private pages/forms.
The assistant can edit packages and prizes, return readiness blockers, and submit
typed registration or feature proposals. Staff review and apply those proposals
in RotaPress; the assistant cannot activate registration or publish the event.

## REST API

Use the same scoped bearer key or OAuth access token. OAuth uses the canonical
`APP_URL/api/mcp` resource for both transports. Cookies alone cannot authorize
`/api/v1`. Responses are `no-store`; JSON mutations have a 256 KiB body limit,
with a separate bounded binary image-upload endpoint. Success is
`{ "data": ... }`; errors are `{ "error": "..." }`. Status codes distinguish
invalid input (400), invalid/expired keys (401), denied scope/access (403), absent
resources (404), disabled integrations or edit/replay conflicts (409), oversized bodies (413), content
policy failures (422) and rate limits (429). Back off on 429; reconcile a 409.

Discovery:

- `GET /api/v1/capabilities`
- `GET /api/v1/openapi.json` (OpenAPI 3.1, generated from the active schemas)
- `GET /api/v1/prompts`
- `POST /api/v1/prompts/adapt_reference_website` with the prompt arguments above
- `POST /api/v1/prompts/plan_native_website`, `/prompts/prepare_event` and
  `/prompts/review_page_design` with their discovered workflow arguments

Paths below are relative to `/api/v1`:

| Content           | Read                                                                                                               | Private draft writes                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Website           | `GET /website/context?locale=en`, `/website/design`, `/website/content`, `/website/content/{id}?locale=en`         | `POST /website/content`, `PATCH /website/content/{id}`                                                                          |
| Visual review     | `POST /website/content/{id}/preview` renders the saved revision                                                    | None                                                                                                                            |
| Reference         | `POST /sources/read` with `url`                                                                                    | None                                                                                                                            |
| Imports           | `GET /imports/{requestId}`                                                                                         | `POST /imports`                                                                                                                 |
| Forms             | `GET /forms`, `/forms/{id}`                                                                                        | `POST /forms`, `PATCH /forms/{id}`                                                                                              |
| Events            | `GET /events`, `/events/{id}`                                                                                      | `POST /events`, `PATCH /events/{id}`                                                                                            |
| Event preparation | `GET /events/blueprints`, `/events/{id}/preparation`, `/events/{id}/proposals`; `POST /events/preparation/preview` | `POST /events/preparation`, `/events/{id}/forms`, `/events/proposals`; `PATCH /events/{eventId}/packages`, `/events/{eventId}/prizes` |
| Directory         | `GET /directory`                                                                                                   | `POST /directory`, `PATCH /directory/{id}`                                                                                      |
| Media             | `GET /media`, `/media/{id}`, `/media/{id}/image` (separate pixel scope)                                            | `POST /media/uploads` (small JSON), `/media/upload` (binary), `PATCH /media/{id}/metadata`                                      |
| Calendar          | `GET /calendar` (content definitions)                                                                              | Use Calendar in administration                                                                                                  |

Collection reads accept `offset` and `limit` (default 20, maximum 50), returning
`items` and `nextOffset`. Calendar is a workspace projection. These adapters reuse
existing club-sized service lists; this release does not claim large-dataset
database cursor pagination. Path IDs must not be repeated in the body.

CMS saves need `expectedRevisionId`; forms need `expectedRevision`; event and
directory saves need `expectedVersion`. Reread and reconcile on conflict. Individual
POST creation is not idempotent; use imports for retry-safe multi-page creation.
Media uploads, event preparation and settings proposals have their own stable
request IDs and conflict rules. Follow their schemas and reuse the exact input on
retries. See the [API reference](api-reference.md) for all endpoints and examples.

Example import body:

```json
{
  "requestId": "30eaf5ac-3629-49a7-87da-ea1a36381125",
  "pages": [
    {
      "locale": "en",
      "title": "About our club",
      "slug": "about-our-club",
      "description": "An introduction to our club.",
      "sourceUrl": "https://www.example.org/about",
      "sections": [
        {
          "heading": "Our story",
          "text": "Replace this example with verified club information."
        }
      ]
    }
  ]
}
```

A batch of up to ten pages commits or rolls back together. Existing slugs are
never overwritten. Text becomes native Heading/RichText blocks with escaped markup.
Retries must reuse the exact parsed payload and UUID; changed content under the
same UUID returns 409. Receipts retain review links and client-supplied attribution,
not source HTML or a certification of accuracy/reuse rights.

## Security and current limits

Better Auth owns hashed keys and OAuth tokens. Neither creates a synthetic staff session. Every
request reloads the genuine parent session and membership; each operation checks
scope, capability, organization and enabled features before invoking shared domain
services. Existing transaction, version, sanitization and audit rules apply.
Host/Origin checks also protect browser boundaries.

Sources require an allowed origin, HTTPS and public IPv4 DNS results. The validated
IP is pinned to TLS. Private/reserved addresses, redirects, embedded credentials,
custom ports and compressed responses are rejected. The client honors robots.txt,
caps HTML at 512,000 bytes and robots files at 64,000 bytes, and applies DNS/request
deadlines. A missing robots file (404) is allowed; denied/unavailable policies fail
closed. Scripts never run. Authenticated, JavaScript-rendered and IPv6-only sites
and automatic media downloads are unsupported. Uploads require actual approved
image bytes from the client rather than a source URL.

General limits are 120 requests/connection/minute, 20 source reads/connection/minute
and 240 authentication attempts/address/minute. Image processing, preview and OAuth
have additional bounded quotas described in their guides. Trusted proxy addressing
must follow the hosting guide.

Publication, scheduling, deletion, appearance activation, CustomCode writes,
provider credentials, member approvals, submissions, guests, payments, draws and
email are unavailable. Form reads omit answers/counts; event reads omit staff and
participants. Website/media scopes still grant private content, so choose your
AI client and its grants accordingly.

Apply the normal pending migrations for connection, OAuth, private-media retry,
proposal and availability tables. RotaPress needs no AI-model key or provider
credentials for this integration. Local fixture checks do not establish
live website fetching or acceptance by a particular external AI client.
See the [API/MCP contribution contract](../development/automation.md) for feature changes.
