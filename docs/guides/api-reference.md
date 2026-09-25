# REST API reference and interactive tester

Open **Integrations > AI & API > API documentation & tester** as an approved owner
or administrator. The screen describes every registered operation, shows its
input/output schemas and validated example, and tests the actual REST or MCP
endpoint. It is available at `/admin/integrations/automation/docs`.

Create a scoped connection in AI & API first. Paste its key into the tester's
password field. The tester retains it only in page memory, sends no session cookies,
allows only this instance's API paths and refuses redirects. Clear the key when
finished. Request/response text is rendered as text, never HTML. There are no
external documentation scripts, analytics or third-party request proxies.

**Draft requests are real saves.** Begin with `automation_capabilities` or a list
operation. Select an operation, review the example, replace placeholder IDs and
facts, then send. Changing operation loads its example. An import example receives
a new UUID when selected; preserve that UUID and the exact body when retrying.
The MCP connection check initializes the protocol and lists tools, resources and
prompts without creating content. Download OpenAPI for another API client.

## Authentication and transport

- Base: the canonical `APP_URL` followed by `/api/v1`.
- Header: `Authorization: Bearer <RotaPress connection key>`.
- JSON mutation bodies: `Content-Type: application/json`, at most 262,144 bytes.
- HTTPS on a hosted server. Local clients may use a loopback development origin.
- Responses are `Cache-Control: no-store`. Cross-origin browser calls are denied.
- Cookies alone never authorize the API; a key cannot authorize admin endpoints.
- Keys expire after 5 minutes to 8 hours and never outlive their parent session.
  Sign-out, expiry, suspension and current capability changes are rechecked.
- Keys cannot publish, schedule, delete, issue keys, change access, send mail,
  run CustomCode or read submissions, guests, payments and draw records.

Grant only the scopes needed for the task. Reads can include private drafts and
private media metadata. Send those only to a client you have chosen to trust.

## Discovery

| Method and path | Purpose |
| --- | --- |
| `GET /capabilities` | Compact granted operation catalogue, source origins and feature states |
| `GET /openapi.json` | Full OpenAPI 3.1 document; input/output schemas and request examples |
| `GET /prompts` | Prompt names and arguments |
| `POST /prompts/adapt_reference_website` | Adaptation instructions for `sourceUrl`, optional `locale` and `brief` |

Capabilities and the prompt are also MCP tools, so clients that expose only tools
can discover the workflow. Feature availability and permissions still apply when
a tool is executed. A listed tool does not override a disabled feature.

## Content operations

The interactive reference and downloadable OpenAPI are generated from the same
registry that handles requests. Use them for every field, enum and required value.

| REST path | Methods | MCP names | Scopes |
| --- | --- | --- | --- |
| `/website/context` | GET | `website_context` | `website:read` |
| `/website/content` | GET, POST | `website_list`, `website_create` | `website:read`, `website:write` |
| `/website/content/{id}` | GET, PATCH | `website_get`, `website_save` | `website:read`, `website:write` |
| `/sources/read` | POST | `source_read` | `sources:read` |
| `/imports` | POST | `content_import` | `website:write` |
| `/imports/{requestId}` | GET | `import_get` | `website:read` |
| `/media` | GET | `media_list` | `media:read` |
| `/forms` | GET, POST | `forms_list`, `forms_create` | `forms:read`, `forms:write` |
| `/forms/{id}` | GET, PATCH | `forms_get`, `forms_save` | `forms:read`, `forms:write` |
| `/events` | GET, POST | `events_list`, `events_create` | `events:read`, `events:write` |
| `/events/{id}` | GET, PATCH | `events_get`, `events_save` | `events:read`, `events:write` |
| `/directory` | GET, POST | `directory_list`, `directory_create` | `directory:read`, `directory:write` |
| `/directory/{id}` | PATCH | `directory_save` | `directory:write` |
| `/calendar` | GET | `calendar_read` | `calendar:read` |

Use query parameters for GET, and JSON for POST/PATCH. Do not repeat a path ID in
the body or query. The tester's combined input moves IDs to the REST path for you;
MCP arguments include the IDs directly. Unknown fields and repeated query fields
are rejected. For `website_get`, include `locale=en`, `fr` or `lb`.

## Responses and safe retries

Content requests return `{ "data": ... }`. List data contains `items` and
`nextOffset`; pass `offset=nextOffset` until it becomes null. `limit` defaults to
20 and is capped at 50. Calendar returns a workspace rather than a paged list.
Collection adapters currently use existing club-sized service queries.
`/openapi.json` returns the OpenAPI document itself without the data envelope.

Page results include the draft, published revision ID and revision history. Form
results include the definition and draft revision, without responses or delivery
settings. Event results exclude staff identities and participant records. Directory
results distinguish draft and published profiles. Output validation fails closed
if a service returns unexpected fields.

| Update | Concurrency field |
| --- | --- |
| Page | `expectedRevisionId` from `draft.id` |
| Form | `expectedRevision` from `draftRevision` |
| Event/profile | `expectedVersion` from `version` |

For new page batches, prefer `content_import`: one UUID request ID, 1–10 pages,
each containing 1–12 plain-text sections. The transaction creates all drafts or
none. Repeating the same parsed payload and UUID returns the receipt; changing
the payload under that UUID returns 409. Existing slugs are never overwritten.
Other create operations are not idempotent; do not retry them blindly on timeout.
See the [import example](ai-and-api.md#rest-api).

An import response looks like this (IDs are illustrative):

```json
{
  "data": {
    "requestId": "11111111-1111-4111-8111-111111111111",
    "status": "private-drafts",
    "pages": [{
      "id": "22222222-2222-4222-8222-222222222222",
      "locale": "en",
      "title": "About our club",
      "slug": "about-our-club",
      "sourceUrl": null,
      "reviewUrl": "/admin/website/22222222-2222-4222-8222-222222222222?locale=en"
    }]
  }
}
```

Errors return `{ "error": "An actionable message" }`:

| Status | Action |
| --- | --- |
| 400 / 415 | Correct fields, JSON or Content-Type |
| 401 | Sign in again and create a current scoped connection |
| 403 | Check key scopes, membership, resource ownership and origins |
| 404 | Recheck the endpoint/resource; private resources may be unavailable |
| 409 | Reread changed revisions; inspect import retry data or enabled features |
| 413 | Reduce the request below 256 KiB |
| 422 | Correct rejected content/source policy; do not bypass robots restrictions |
| 429 | Wait at least 60 seconds and reduce concurrency |
| 500 | Retry a read; for a write first inspect saved state or its import receipt |

Limits are 120 requests/key/minute, 20 source reads/key/minute and 240 authentication
attempts/address/minute. Internal SQL, credentials and exception text are not
returned. See [MCP/client setup](mcp-clients.md) and the
[security review boundaries](../development/automation-security.md).
