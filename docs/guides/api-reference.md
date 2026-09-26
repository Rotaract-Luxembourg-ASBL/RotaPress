# REST API reference and interactive tester

Open **Integrations > AI & API > API documentation & tester** as an approved owner
or administrator. The screen describes every registered operation, shows its
input/output schemas and validated example, and tests the actual REST or MCP
endpoint. It is available at `/admin/integrations/automation/docs`.

In **Integrations**, enable **REST API**, **MCP**, or both for the transports you
intend to use. They are independent and disabled by default. Creating a connection
does not enable either transport. Disabling one blocks its operations while
preserving credentials, content and settings; current authorization still applies
if it is enabled again. Changing availability requires a recent staff sign-in.

Create a scoped connection in AI & API. Paste its key into the tester's
password field. The tester retains it only in page memory, sends no session cookies,
allows only this instance's API paths and refuses redirects. Clear the key when
finished. Request/response text is rendered as text, never HTML. There are no
external documentation scripts, analytics or third-party request proxies.

**Draft requests are real saves.** Begin with `automation_capabilities` or a list
operation. Select an operation, review the example, replace placeholder IDs and
facts, then send. Changing operation loads its example. For operations with a
`requestId`, generate one UUID for that intended write and preserve it and the
exact body when retrying. An event preparation also needs its real preview token;
the example token is a placeholder, not an approval.
The MCP connection check initializes the protocol and lists tools, resources and
prompts without creating content. Download OpenAPI for another API client.

## Authentication and transport

- Base: the canonical `APP_URL` followed by `/api/v1`.
- Header: `Authorization: Bearer <RotaPress connection key or OAuth access token>`.
- JSON mutation bodies: `Content-Type: application/json`, at most 262,144 bytes.
- Binary images use the separate bounded upload endpoint described below.
- HTTPS on a hosted server. Local clients may use a loopback development origin.
- Responses are `Cache-Control: no-store`. Cross-origin browser calls are denied.
- Cookies alone never authorize the API; bearer credentials cannot authorize
  administration or apply event suggestions.
- Keys expire after 5 minutes to 8 hours and never outlive their parent session.
  Sign-out, expiry, suspension and current capability changes are rechecked.
- Keys cannot publish, schedule, delete, issue keys, change access, send mail,
  run CustomCode or read submissions, guests, payments and draw records.

Grant only the scopes needed for the task. Reads can include private drafts and
private media metadata. `media:inspect` explicitly permits private image pixels;
`website:preview` permits screenshots of authorized page drafts. Send those only
to a client you have chosen to trust. OAuth uses the same operation scopes and
current session policy; see [OAuth connection setup](automation-oauth.md) for
resource, consent, refresh and revocation requirements.

## Discovery

| Method and path                         | Purpose                                                                |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `GET /capabilities`                     | Compact granted operation catalogue, source origins and feature states |
| `GET /openapi.json`                     | Full OpenAPI 3.1 document; input/output schemas and request examples   |
| `GET /prompts`                          | Prompt names and arguments                                             |
| `POST /prompts/adapt_reference_website` | Adaptation instructions for `sourceUrl`, optional `locale` and `brief` |
| `POST /prompts/plan_native_website`     | Native page design workflow for a `brief` and optional `locale`        |
| `POST /prompts/prepare_event`           | Event preparation workflow for a `brief` and optional `locale`         |
| `POST /prompts/review_page_design`      | Saved-page visual review workflow for `pageId` and optional `locale`   |

Capabilities and workflow prompts are also MCP tools, so clients that expose only
tools can discover the workflow. The MCP prompt names omit the `/prompts/` prefix.
Prompts return instructions; RotaPress does not run a model or generate images.
Feature availability and permissions still apply when a tool is executed. A listed
tool does not override a disabled feature or supply a required additional grant.

## Content operations

The interactive reference and downloadable OpenAPI are generated from the same
registry that handles requests. Use them for every field, enum and required value.

| REST path                       | Methods    | MCP names                            | Scopes                                         |
| ------------------------------- | ---------- | ------------------------------------ | ---------------------------------------------- |
| `/website/context`              | GET        | `website_context`                    | `website:read`                                 |
| `/website/design`               | GET        | `website_design`                     | `website:read`                                 |
| `/website/content`              | GET, POST  | `website_list`, `website_create`     | `website:read`, `website:write`                |
| `/website/content/{id}`         | GET, PATCH | `website_get`, `website_save`        | `website:read`, `website:write`                |
| `/website/content/{id}/preview` | POST       | `website_preview`                    | `website:preview` and `website:read`           |
| `/sources/read`                 | POST       | `source_read`                        | `sources:read`                                 |
| `/imports`                      | POST       | `content_import`                     | `website:write`                                |
| `/imports/{requestId}`          | GET        | `import_get`                         | `website:read`                                 |
| `/media`                        | GET        | `media_list`                         | `media:read`                                   |
| `/media/{id}`                   | GET        | `media_get`                          | `media:read`                                   |
| `/media/uploads`                | POST       | `media_upload`                       | `media:write`                                  |
| `/media/{id}/image`             | GET        | `media_inspect`                      | `media:inspect`                                |
| `/media/{id}/metadata`          | PATCH      | `media_metadata_save`                | `media:write`                                  |
| `/forms`                        | GET, POST  | `forms_list`, `forms_create`         | `forms:read`, `forms:write`                    |
| `/forms/{id}`                   | GET, PATCH | `forms_get`, `forms_save`            | `forms:read`, `forms:write`                    |
| `/events`                       | GET, POST  | `events_list`, `events_create`       | `events:read`, `events:write`                  |
| `/events/{id}`                  | GET, PATCH | `events_get`, `events_save`          | `events:read`, `events:write`                  |
| `/events/blueprints`            | GET        | `events_blueprints`                  | `events:read`                                  |
| `/events/preparation/preview`   | POST       | `events_prepare_preview`             | `events:prepare` plus preparation grants below |
| `/events/preparation`           | POST       | `events_prepare`                     | `events:prepare` plus preparation grants below |
| `/events/{id}/preparation`      | GET        | `events_workspace`                   | `events:read`                                  |
| `/events/{id}/forms`            | POST       | `events_form_create`                 | `forms:write`                                  |
| `/events/{id}/packages`         | GET        | `events_packages`                    | `events:read`                                  |
| `/events/{eventId}/packages`    | PATCH      | `events_package_save`                | `events:prepare`                               |
| `/events/{id}/prizes`           | GET        | `events_prizes`                      | `events:read`                                  |
| `/events/{eventId}/prizes`      | PATCH      | `events_prize_save`                  | `events:prepare`                               |
| `/events/proposals`             | POST       | `events_propose_settings`            | `events:prepare`                               |
| `/events/{id}/proposals`        | GET        | `events_proposals`                   | `events:read`                                  |
| `/directory`                    | GET, POST  | `directory_list`, `directory_create` | `directory:read`, `directory:write`            |
| `/directory/{id}`               | PATCH      | `directory_save`                     | `directory:write`                              |
| `/calendar`                     | GET        | `calendar_read`                      | `calendar:read`                                |

Use query parameters for GET, and JSON for POST/PATCH. Do not repeat a path ID in
the body or query. The tester's combined input moves IDs to the REST path for you;
MCP arguments include the IDs directly. Unknown fields and repeated query fields
are rejected. For `website_get`, include `locale=en`, `fr` or `lb`.

## Design, images and visual review

Read `automation_capabilities`, `website_context` and `website_design` before
writing pages. The design result describes native block schemas, allowed page,
shared-part and event contexts, starter templates, bundled images and event
layouts. Use real record IDs for connected content. Templates create editable
content; they do not install a theme. Current branding and publication rules still
apply. Custom HTML/JavaScript remains unavailable to automation.

An AI client can upload a PNG, JPEG or WebP with `media_upload`: canonical base64
containing at most **180 KiB** of decoded bytes inside the normal JSON limit. A
client with HTTP upload support can instead send an original of at most **5 MiB**
to `POST /api/v1/media/upload`, using the binary image body and the
`X-RotaPress-Upload` metadata header. That REST-only transport variant uses the
same `media:write` grant, validation, private storage and retry receipt. It is
documented in OpenAPI; the JSON tester does not construct binary bodies. See the
[image upload and inspection guide](automation-media.md) for exact headers,
quotas, client-side compression and examples.

Neither upload fetches an arbitrary URL or makes an image public. Media listing
and detail reads return metadata only. `media_inspect` requires `media:inspect`
and returns a bounded normalized WebP for clients with vision support. Metadata
edits require a private asset and its current `metadataRevision`; they cannot
change public visibility or overwrite image bytes.

After saving a page, call `website_preview` with its saved revision ID at desktop
and phone sizes. Follow `nextOffsetY` to inspect the rest of a long page. Private
images additionally require `media:inspect`. REST image results contain base64;
MCP returns an image content block with accompanying metadata. Review warnings:
JavaScript and interactive controls are inactive. A preview neither publishes
nor supplies an anonymous link. See [visual review](automation-preview.md) for
runtime requirements, limits and manual checks.

## Prepare an event and review settings

1. Read `events_blueprints` and select a preset or a source event you can access.
2. Call `events_prepare_preview` with verified event details. Inspect its contents
   and retain the returned snapshot token.
3. Call `events_prepare` with the same details, token and a new `requestId`. The
   existing event services create the event and linked private drafts atomically.
   The current staff member becomes manager; native registration starts closed.
4. Read `events_workspace` to find page/form IDs, configuration versions, readiness
   blockers and staff review links. Edit native page, form, package and prize
   drafts through their versioned operations; package checkout remains disabled.
5. Use `events_propose_settings` for a registration or event-feature change. Return
   the proposal's review URL to the staff member and inspect its status with
   `events_proposals`.

Preparation needs `events:prepare`, `events:write`, `website:read` and
`website:write`. A preset using forms or an event copy also needs `forms:read`
and `forms:write`; a copy additionally needs `events:read`. Current domain
capabilities, enabled features and source-event access are checked separately.
The workspace only includes page/form summaries when their read grants are present.

Creating a proposal saves an immutable suggestion and changes no event settings.
Applying it requires a recently authenticated staff member with current
integration and event permissions in the administration review screen. That
manual action applies the exact settings immediately; enabling registration or
disabling a feature can affect an already-published event. Content publication is
unchanged. Changed versions leave a proposal pending for a fresh review.
Rejecting it leaves settings unchanged. The administration apply/reject endpoint
is deliberately absent from REST automation and MCP; `confirmed: true` in a model
request is not human approval.

Preparation never copies participants, purchases, credentials or provider state.
It does not send invitations, process payments, run draws or activate a real event
on an external provider. See the [workflow contract](../development/automation-workflows.md).

## Responses and safe retries

Content requests return `{ "data": ... }`. Paginated list data contains `items` and
`nextOffset`; pass `offset=nextOffset` until it becomes null. `limit` defaults to
20 and is capped at 50. Calendar returns a workspace rather than a paged list.
Collection adapters currently use existing club-sized service queries.
`/openapi.json` returns the OpenAPI document itself without the data envelope.

Page results include the draft, published revision ID and revision history. Form
results include the definition and draft revision, without responses or delivery
settings. Event results exclude staff identities and participant records. Directory
results distinguish draft and published profiles. Output validation fails closed
if a service returns unexpected fields.

| Update                      | Concurrency field                              |
| --------------------------- | ---------------------------------------------- |
| Page / visual preview       | `expectedRevisionId` from `draft.id`           |
| Form                        | `expectedRevision` from `draftRevision`        |
| Event/profile/package/prize | `expectedVersion` from `version`               |
| Private media metadata      | `expectedRevision` from `metadataRevision`     |
| Event settings proposal     | Target event or registration `expectedVersion` |

For new page batches, prefer `content_import`: one UUID request ID, 1–10 pages,
each containing 1–12 plain-text sections. The transaction creates all drafts or
none. Repeating the same parsed payload and UUID returns the receipt; changing
the payload under that UUID returns 409. Existing slugs are never overwritten.
Image uploads, event preparation and event-setting proposals also support stable
`requestId` retries. Keep the exact bytes/metadata or reviewed payload and token.
Receipts remain bound to the creating actor and organization; a changed payload
conflicts. Deleting an uploaded asset does not let its old request ID recreate it.
Other create operations are not idempotent; do not retry them blindly on timeout.
Inspect the returned state before retrying versioned updates. See the
[import example](ai-and-api.md#rest-api).

An import response looks like this (IDs are illustrative):

```json
{
  "data": {
    "requestId": "11111111-1111-4111-8111-111111111111",
    "status": "private-drafts",
    "pages": [
      {
        "id": "22222222-2222-4222-8222-222222222222",
        "locale": "en",
        "title": "About our club",
        "slug": "about-our-club",
        "sourceUrl": null,
        "reviewUrl": "/admin/website/22222222-2222-4222-8222-222222222222?locale=en"
      }
    ]
  }
}
```

Errors return `{ "error": "An actionable message" }`:

| Status    | Action                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------- |
| 400 / 415 | Correct fields, JSON or Content-Type                                                                |
| 401       | Sign in again and create a current scoped connection                                                |
| 403       | Check key scopes, membership, resource ownership and origins                                        |
| 404       | Recheck the endpoint/resource; private resources may be unavailable                                 |
| 408       | Retry a timed-out image body upload using its unchanged request ID and payload                      |
| 409       | Check transport/feature availability, changed revisions and retry payloads                          |
| 413       | Reduce the JSON, image or screenshot request according to the endpoint limit                        |
| 422       | Correct rejected content/source policy; do not bypass robots restrictions                           |
| 429       | Follow the stated limit, wait and reduce concurrency; daily upload quotas last longer than a minute |
| 500       | Retry a read; for a write first inspect saved state or its retry receipt                            |
| 503       | Check the preview runtime or unavailable dependency before retrying                                 |

Limits are 120 requests/key/minute, 20 source reads/key/minute and 240 authentication
attempts/address/minute. Image and preview operations have additional limits in
their guides. Internal SQL, credentials and exception text are not returned.
See [MCP/client setup](mcp-clients.md) and the
[security review boundaries](../development/automation-security.md).
