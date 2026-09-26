# REST API reference and live tester

Open **Integrations → REST API → API tokens, docs & tester**. This integration
has two sections: **API tokens** and **Documentation & tester**. The direct path
is `/admin/integrations/rest`; append `?tab=docs` to open the reference.

1. Enable **REST API** in Integrations. It defaults to disabled. A current owner
   or administrator can generate a token even while access is disabled.
2. In **API tokens**, enter a recognizable name and expiry. Choose actions by
   group, or use **Select all**, **Clear all**, **Read only** or **Website drafts**.
   Reference reading requires exact approved HTTPS origins.
3. Select **Generate API token**. Copy the one-time token into protected client
   settings, or select **Use in live tester** to test it here without repasting.
4. Start with the capabilities endpoint. Search or select another endpoint to
   see its required permission, schemas, example input and cURL request.
5. Inspect the HTTP status and response. **Send write request** performs a real
   mutation, including publication for an authorized publish endpoint. Review
   example IDs and facts first. Download OpenAPI for another client.

Token generation requires a sign-in within the last 15 minutes. The screen provides
**Sign in again** when renewal is needed. Tokens expire after 5 minutes to 8 hours
and stop when their parent session ends. Revoke unwanted tokens from this workspace.

The tester keeps credentials only in page memory. Tabs preserve entered work;
reload or **Clear credential and response** clears the tester credential. It sends
no session cookies, uses only this instance's API paths and refuses redirects.
Request and response content is rendered as text. For operations with a request ID,
keep that ID and the exact payload when retrying. Event preparation also needs the
snapshot token returned by its preview operation.

## Authentication and transport

- Base: the canonical `APP_URL` followed by `/api/v1`.
- Header: `Authorization: Bearer <RotaPress REST API token>`.
- JSON mutation bodies: `Content-Type: application/json`, at most 262,144 bytes.
- Binary images use the separate bounded upload endpoint described below.
- HTTPS on a hosted server. Local clients may use a loopback development origin.
- Responses are `Cache-Control: no-store`. Cross-origin browser calls are denied.
- Cookies alone never authorize the API; bearer credentials cannot authorize
  administration or apply event suggestions.
- Keys expire after 5 minutes to 8 hours and never outlive their parent session.
  Sign-out, expiry, suspension and current capability changes are rechecked.
- Draft-write scopes do not publish. Publication requires a separate grant,
  exact current saved target and `confirmed: true`.
- Keys cannot schedule future publication, unpublish, delete, issue keys, change access, directly send mail,
  run CustomCode or read submissions, guests, payments and draw records.

Grant only the scopes needed for the task. Reads can include private drafts and
private media metadata. `media:inspect` explicitly permits private image pixels;
`website:preview` permits screenshots of authorized page drafts. Send those only
to a client you have chosen to trust. Tokens belong to REST only. MCP access keys
and OAuth tokens are rejected by REST.

## Discovery

Paths in the tables below are relative to `/api/v1`.

| Method and path                         | Purpose                                                                |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `GET /capabilities`                     | Compact granted operation catalogue, source origins and feature states |
| `GET /openapi.json`                     | Full OpenAPI 3.1 document; input/output schemas and request examples   |
| `GET /prompts`                          | Prompt names and arguments                                             |
| `POST /prompts/adapt_reference_website` | Adaptation instructions for `sourceUrl`, optional `locale` and `brief` |
| `POST /prompts/plan_native_website`     | Native page design workflow for a `brief` and optional `locale`        |
| `POST /prompts/prepare_event`           | Event preparation workflow for a `brief` and optional `locale`         |
| `POST /prompts/prepare_project`         | Project story workflow for a `brief` and optional `locale`              |
| `POST /prompts/review_page_design`      | Saved-page visual review workflow for `pageId` and optional `locale`   |

Capabilities and workflow prompts describe the available preparation workflows.
Prompts return instructions; RotaPress does not run a model or generate images.
Feature availability and permissions still apply when a tool is executed. A listed
tool does not override a disabled feature or supply a required additional grant.

## Content operations

The interactive reference and downloadable OpenAPI are generated from the same
registry that handles requests. Use them for every field, enum and required value.

| REST path                                                 | Methods    | Scopes                                         |
| --------------------------------------------------------- | ---------- | ---------------------------------------------- |
| `/website/context`                                        | GET        | `website:read`                                 |
| `/website/design`                                         | GET        | `website:read`                                 |
| `/website/content`                                        | GET, POST  | `website:read`, `website:write`                |
| `/website/content/{id}`                                   | GET, PATCH | `website:read`, `website:write`                |
| `/website/content/{id}/preview`                           | POST       | `website:preview` and `website:read`           |
| `/website/content/{id}/revisions/{revisionId}`            | GET        | `website:read`                                 |
| `/website/content/{id}/restore`                           | PATCH      | `website:manage`                               |
| `/website/content/{id}/copies`                            | POST       | `website:manage`                               |
| `/website/content/{id}/languages`                         | POST       | `website:manage`                               |
| `/website/settings`                                       | PATCH      | `website:settings`                             |
| `/sources/read`                                           | POST       | `sources:read`                                 |
| `/imports`                                                | POST       | `website:write`                                |
| `/imports/{requestId}`                                    | GET        | `website:read`                                 |
| `/media`                                                  | GET        | `media:read`                                   |
| `/media/{id}`                                             | GET        | `media:read`                                   |
| `/media/uploads`                                          | POST       | `media:write`                                  |
| `/media/{id}/image`                                       | GET        | `media:inspect`                                |
| `/media/{id}/metadata`                                    | PATCH      | `media:write`                                  |
| `/forms`                                                  | GET, POST  | `forms:read`, `forms:write`                    |
| `/forms/{id}`                                             | GET, PATCH | `forms:read`, `forms:write`                    |
| `/events`                                                 | GET, POST  | `events:read`, `events:write`                  |
| `/events/{id}`                                            | GET, PATCH | `events:read`, `events:write`                  |
| `/events/blueprints`                                      | GET        | `events:read`                                  |
| `/events/preparation/preview`                             | POST       | `events:prepare` plus preparation grants below |
| `/events/preparation`                                     | POST       | `events:prepare` plus preparation grants below |
| `/events/{id}/preparation`                                | GET        | `events:read`                                  |
| `/events/{id}/forms`                                      | POST       | `forms:write`                                  |
| `/events/{id}/packages`                                   | GET        | `events:read`                                  |
| `/events/{eventId}/packages`                              | PATCH      | `events:prepare`                               |
| `/events/{id}/prizes`                                     | GET        | `events:read`                                  |
| `/events/{eventId}/prizes`                                | PATCH      | `events:prepare`                               |
| `/events/proposals`                                       | POST       | `events:prepare`                               |
| `/events/{id}/proposals`                                  | GET        | `events:read`                                  |
| `/directory`                                              | GET, POST  | `directory:read`, `directory:write`            |
| `/directory/{id}`                                         | PATCH      | `directory:write`                              |
| `/projects`                                               | GET, POST  | `projects:read`, `projects:write`              |
| `/projects/{id}`                                          | GET, PATCH | `projects:read`, `projects:write`              |
| `/calendar`                                               | GET        | `calendar:read`                                |
| `/calendar/calendars`                                     | POST       | `calendar:write`                               |
| `/calendar/calendars/{id}`                                | PATCH      | `calendar:write`                               |
| `/calendar/calendars/{id}/archive`                        | PATCH      | `calendar:write`                               |
| `/calendar/calendars/{id}/restore`                        | PATCH      | `calendar:write`                               |
| `/calendar/calendars/{calendarId}/schedules`              | POST       | `calendar:write`                               |
| `/calendar/calendars/{calendarId}/schedules/{id}`         | PATCH      | `calendar:write`                               |
| `/calendar/calendars/{calendarId}/schedules/{id}/archive` | PATCH      | `calendar:write`                               |
| `/calendar/calendars/{calendarId}/schedules/{id}/restore` | PATCH      | `calendar:write`                               |
| `/calendar/page`                                          | PATCH      | `calendar:design`                              |

Use query parameters for GET, and JSON for POST/PATCH. Do not repeat a path ID in
the body or query. The tester's combined input moves IDs to the REST path for you;
MCP arguments include the IDs directly. Unknown fields and repeated query fields
are rejected. For `website_get` and `website_revision_get`, include `locale=en`,
`fr` or `lb`.

Website copies use a stable `requestId` and the exact current source revision.
History reads are scoped to the page and language. Restoration saves a new draft;
adding a language creates an empty draft without overwriting an existing language.
Settings saves require the current `website_context.site.version` and preserve
unrelated settings and template installation records. Appearance and navigation
changes remain drafts until separately published.

Calendar mutations return the saved `version` and Calendar review URL. Read
`calendar_read` before editing and send the current `expectedVersion`. Full activity
definitions support recurrence, skipped dates and cancellation drafts. Archive and
restore operations accept only unpublished records. Editing a published item's
draft preserves its public snapshot. Page design uses a separate grant. On an
uncertain create response, list and inspect existing records before retrying.

## Requested publication

Use these endpoints only for an explicitly requested publication of reviewed saved
content. Every body requires literal `confirmed: true` and the current concurrency
field below. IDs in paths stay out of the REST body. Existing credentials do not
gain publication grants; issue a new token with the required actions selected.

| Method and path                                                 | Grant               | Current saved target                                                                 |
| --------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `PATCH /website/content/{id}/publish`                           | `website:publish`   | `locale` and `expectedRevisionId` from the content draft                             |
| `PATCH /website/settings/publish`                               | `website:publish`   | `locale`, `expectedVersion` from website context and `scope: "settings"` or `"menu"` |
| `PATCH /calendar/calendars/{id}/publish`                        | `calendar:publish`  | Calendar `expectedVersion`                                                           |
| `PATCH /calendar/calendars/{calendarId}/schedules/{id}/publish` | `calendar:publish`  | Activity `expectedVersion` and owning calendar                                       |
| `PATCH /calendar/page/publish`                                  | `calendar:publish`  | Page-design `expectedVersion`                                                        |
| `POST /forms/{id}/publish`                                      | `forms:publish`     | `expectedRevision` from `draftRevision`                                              |
| `POST /events/{id}/publish`                                     | `events:publish`    | Event `expectedVersion`                                                              |
| `POST /events/{eventId}/prizes/{id}/publish`                    | `events:publish`    | Editorial prize `expectedVersion` and owning event                                   |
| `POST /directory/{id}/publish`                                  | `directory:publish` | Profile `expectedVersion`                                                            |
| `POST /projects/{id}/publish`                                   | `projects:publish`  | Project story `expectedVersion`                                                      |

Read the target immediately before publishing. A stale revision/version conflicts;
do not silently substitute a newer unreviewed draft. The server also enforces
current identity, publication capability, resource ownership and domain readiness.
Private media and missing published dependencies remain blockers; calls never
change visibility or publish dependencies automatically.

`scope: "settings"` activates all saved website settings, including appearance;
review them together. `scope: "menu"` activates homepage/menu selections while
preserving published appearance and other settings. Neither publishes page drafts.
Shared headers, footers, sections and directory profiles can update existing public
placements. Event publication requires its enabled Website module and already
published page; it does not publish forms/prizes or activate registration.
Editorial prize publication requires recent sign-in and never issues entries or
runs a draw. Package publication remains in administration because it can affect checkout.

Calendar details, activities and page design publish independently and honor the
saved audience; an unpublished calendar still prevents public activity display.
Normal subscriber notifications can follow publication. Published forms can accept
responses under their existing rules. Unpublish, delete and media-visibility
operations are not exposed.

Project publication activates only the saved project story. Its cover image must
already be public; the call does not publish another page, add a calendar schedule
or change registration. Project draft edits retain their public snapshot.

When an AI client calls these endpoints, it must honor an explicit user request
and should require client-side approval. The server validates delegated authority
and saved state; `confirmed: true` does not prove a human's instruction in another
app. See [publication workflow](ai-and-api.md#publish-only-when-requested).

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
Pagination uses offsets rather than database cursors and is intended for club-sized
collections.
`/openapi.json` returns the OpenAPI document itself without the data envelope.

Page results include the draft, published revision ID and revision history. Form
results include the definition and draft revision, without responses or delivery
settings. Event results exclude staff identities and participant records. Directory
results distinguish draft and published profiles. Output validation fails closed
if a service returns unexpected fields.

Project results include `id`, stable `slug`, `version`, complete `draft`,
`published` content (or null), `changed`, `archived` and a staff `reviewUrl`.
`projects_create` accepts the content fields directly; `projects_save` accepts
`expectedVersion` and `content`. Title is required to save; a summary is also
required to publish. Dates, location, cover image, outcomes and the link are optional.
These are project stories, with no volunteer, attendance or registration records.
The `prepare_project` prompt
and `automation_project_prompt` tool describe this workflow.

| Update                      | Concurrency field                              |
| --------------------------- | ---------------------------------------------- |
| Page / visual preview       | `expectedRevisionId` from `draft.id`           |
| Form                        | `expectedRevision` from `draftRevision`        |
| Event/profile/project/package/prize | `expectedVersion` from `version`               |
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

Limits are 120 requests/connection/minute, 20 source reads/connection/minute and 240 authentication
attempts/address/minute. Image and preview operations have additional limits in
their guides. Internal SQL, credentials and exception text are not returned.
See [MCP/client setup](mcp-clients.md) and the
[security review boundaries](../development/automation-security.md).
