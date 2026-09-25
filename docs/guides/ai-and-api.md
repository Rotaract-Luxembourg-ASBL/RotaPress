# AI content, REST API and MCP

Give an AI client scoped access to prepare website content. A reference website
supplies text and page structure; RotaPress supplies the installed theme and native
blocks. Every automation write creates or updates a **private draft**. Review and
publication stay in administration. This integration does not include a model or
autonomous crawler: your MCP client runs its model and calls the available tools.

## Connect an assistant

Use the [REST reference and interactive tester](api-reference.md) for complete
operation schemas, examples and real requests. See [Claude/OpenAI setup](mcp-clients.md)
for client configurations and the MCP protocol reference.

1. Sign in as an approved owner or administrator and open **Integrations → AI & API**.
2. Choose a name, expiry and allowed actions. For reference-site work, select website
   reading/writing and reference reading. Add each exact HTTPS origin, such as
   `https://www.example.org`; bare hosts and `www` are different grants.
3. Create the connection and copy its one-time key to your client's protected
   credentials. Never put it in prompts, repositories, shared screenshots or URLs.
4. Connect through remote MCP or the local stdio bridge below.
5. Use `adapt_reference_website` with `sourceUrl`, optional `locale` (`en`, `fr`, `lb`)
   and `brief`. Explain the pages you need and supply verified club facts.
6. Open the returned draft links. Check facts, source reuse rights, links, SEO and
   phone layouts. Add pages to navigation and publish manually when ready.

Creating a key requires a sign-in within 15 minutes. Keys expire after 5 minutes to
8 hours (default 1 hour), never later than their parent session. Sign-out, expired
sessions, suspended membership or an incompatible Google-only policy stops access.
Revoke a key from the same screen. Keys cannot grant new permissions, enable
features or create keys. Issuance is rate limited and asks you to revoke an existing
connection when 20 are active. The list shows the latest 100 connections; Better
Auth cleans up expired keys.

## MCP clients

Use `/api/mcp` on the canonical `APP_URL`, with `Authorization: Bearer <key>` in the
client's secret settings. This stateless Streamable HTTP endpoint authenticates
every POST and returns JSON. It has no persistent SSE stream or MCP session ID.
Each POST accepts one MCP message; legacy JSON-RPC batches are rejected so they
cannot bypass request quotas.

This is a first-party, manually configured credential connection. It does **not**
implement OAuth discovery or dynamic client registration. OAuth-only connectors
cannot connect directly; this is not a verified ChatGPT integration.

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

Tools-only clients can call `automation_capabilities` and `automation_prompt` for
the same discovery and content instructions. The 23 tool operations publish input
and output schemas; successful responses are validated before being returned.

The prompt inventories existing content, reads up to ten reference pages, preserves
the theme and returns native drafts, source mappings and unresolved facts. All
source and saved content is untrusted data; it cannot authorize tools, grant
permissions, request secrets or execute code.

## REST API

Use the same bearer key. Cookies alone cannot authorize `/api/v1`. Responses are
`no-store`; mutations require JSON objects with a 256 KiB body limit. Success is
`{ "data": ... }`; errors are `{ "error": "..." }`. Status codes distinguish
invalid input (400), invalid/expired keys (401), denied scope/access (403), absent
resources (404), edit/replay conflicts (409), oversized bodies (413), content
policy failures (422) and rate limits (429). Back off on 429; reconcile a 409.

Discovery:

- `GET /api/v1/capabilities`
- `GET /api/v1/openapi.json` (OpenAPI 3.1, generated from the active schemas)
- `GET /api/v1/prompts`
- `POST /api/v1/prompts/adapt_reference_website` with the prompt arguments above

Paths below are relative to `/api/v1`:

| Content | Read | Private draft writes |
| --- | --- | --- |
| Website | `GET /website/context?locale=en`, `/website/content`, `/website/content/{id}?locale=en` | `POST /website/content`, `PATCH /website/content/{id}` |
| Reference | `POST /sources/read` with `url` | None |
| Imports | `GET /imports/{requestId}` | `POST /imports` |
| Forms | `GET /forms`, `/forms/{id}` | `POST /forms`, `PATCH /forms/{id}` |
| Events | `GET /events`, `/events/{id}` | `POST /events`, `PATCH /events/{id}` |
| Directory | `GET /directory` | `POST /directory`, `PATCH /directory/{id}` |
| Media | `GET /media` (metadata) | Use Media in administration |
| Calendar | `GET /calendar` (content definitions) | Use Calendar in administration |

Collection reads accept `offset` and `limit` (default 20, maximum 50), returning
`items` and `nextOffset`. Calendar is a workspace projection. These adapters reuse
existing club-sized service lists; this release does not claim large-dataset
database cursor pagination. Path IDs must not be repeated in the body.

CMS saves need `expectedRevisionId`; forms need `expectedRevision`; event and
directory saves need `expectedVersion`. Reread and reconcile on conflict. Individual
POST creation is not idempotent; use imports for retry-safe multi-page creation.

Example import body:

```json
{
  "requestId": "30eaf5ac-3629-49a7-87da-ea1a36381125",
  "pages": [{
    "locale": "en",
    "title": "About our club",
    "slug": "about-our-club",
    "description": "An introduction to our club.",
    "sourceUrl": "https://www.example.org/about",
    "sections": [{
      "heading": "Our story",
      "text": "Replace this example with verified club information."
    }]
  }]
}
```

A batch of up to ten pages commits or rolls back together. Existing slugs are
never overwritten. Text becomes native Heading/RichText blocks with escaped markup.
Retries must reuse the exact parsed payload and UUID; changed content under the
same UUID returns 409. Receipts retain review links and client-supplied attribution,
not source HTML or a certification of accuracy/reuse rights.

## Security and current limits

Better Auth owns hashed keys. Keys never create synthetic staff sessions. Every
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
and automatic media downloads are unsupported.

Limits are 120 requests/key/minute, 20 source reads/key/minute and 240 authentication
attempts/address/minute. Trusted proxy addressing must follow the hosting guide.

Publication, scheduling, deletion, appearance activation, CustomCode writes,
provider credentials, member approvals, submissions, guests, payments, draws and
email are unavailable. Form reads omit answers/counts; event reads omit staff and
participants. Website/media scopes still grant private content, so choose your
AI client and its grants accordingly.

Normal migrations apply `0042_lazy_mesmero.sql`; RotaPress needs no AI-model key or
provider credentials for this integration. Local fixture checks do not establish
live website fetching or acceptance by a particular external AI client.
See the [API/MCP contribution contract](../development/automation.md) for feature changes.
