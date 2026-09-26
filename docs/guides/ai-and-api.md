# AI content, REST API and MCP

Give an AI client scoped access to prepare website, project, calendar and event content.
A reference website supplies text and page structure; RotaPress supplies the installed theme
and native blocks. Automation prepares **private drafts**, private images and
settings proposals for review. With a separate publication grant, an assistant can
publish the exact saved content you explicitly ask it to publish. Applying
operational settings stays in administration. This integration does not include a model or autonomous crawler:
your MCP client runs its model and calls the available tools.

## Connect an assistant

Use the [REST reference and interactive tester](api-reference.md) for complete
operation schemas, examples and real requests. See [AI client setup](mcp-clients.md)
for connection choices and the MCP protocol reference, or follow the
[OAuth guide](automation-oauth.md) to connect through an assistant's MCP/apps/plugins UI.

1. Sign in as an approved owner or administrator. Open **Integrations**, enable
   **MCP**, then select **Connections & setup guide** on its card.
2. Choose ChatGPT or Claude to fill OAuth connection settings automatically, then
   choose permitted actions. Other apps use Advanced for their exact callback.
   Alternatively, create a dedicated MCP access key for protected bearer clients.
   For reference-site work, select website reading/writing and reference reading.
   Add each exact HTTPS origin, such as `https://www.example.org`; bare hosts and
   `www` are different grants.
3. Copy the one-time client secret or key into the client's protected settings.
   Never put credentials in prompts, repositories, shared screenshots or URLs.
4. Connect through the assistant's OAuth UI, bearer-authenticated remote MCP or the
   [local stdio bridge](mcp-clients.md#local-stdio-clients-including-claude-desktop).
   OAuth opens RotaPress for sign-in and consent.
5. Use `adapt_reference_website` with `sourceUrl`, optional `locale` (`en`, `fr`, `lb`)
   and `brief`. Explain the pages you need and supply verified club facts.
6. Ask for desktop/phone previews of saved drafts when the connection has the
   preview scope. Open the returned review links. Check facts, reuse rights, links,
   SEO and phone layouts. When ready, publish in administration or explicitly ask
   the assistant to publish the reviewed items using its publication grants.

**REST API** and **MCP** are separate integrations, both **disabled by default**.
Enable REST API separately for direct HTTP calls, binary uploads or its tester.
REST tokens use `rp_rest_`; MCP keys use `rp_mcp_`. Each credential is enforced
only on its integration. Existing shared keys retain REST access only; replace
them with an MCP key or OAuth connection when reconnecting an assistant.
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

OAuth access tokens last five minutes. **Keep connected** is selected by default
on the consent screen so the client can renew them without asking you again.
Refresh tokens last up to seven days and rotate on use while the originating
staff session stays active. Uncheck the option for access without renewal.
RotaPress remembers approved actions for the same client and resource instead
of forcing consent for each connection attempt. MCP must remain enabled to
authorize or renew access. See
[OAuth expiry and revocation](automation-oauth.md#permissions-expiry-and-revocation).

Existing connections keep their original grants when new actions become available.
To use broader website, project or calendar actions, create a new OAuth connection, MCP
access key or REST token with those actions selected. Reconnect and approve the
new OAuth consent when applicable; simply upgrading RotaPress does not add access.
If an OAuth client omits `scope`, the request uses that registered connection's
allowed actions and still needs an applicable consent. An explicit subset such as
`website:read` remains read-only; RotaPress never expands it automatically.

## MCP clients

The endpoint is `/api/mcp` on the canonical `APP_URL`. Choose OAuth in a compatible
client or store an MCP access key in its protected bearer settings. Hosted clients
need a reachable HTTPS installation; local clients can use loopback. See
[client setup and protocol reference](mcp-clients.md) for configuration examples,
discovery and compatibility requirements.

Start with `automation_capabilities` to discover granted operations, source origins
and enabled features. Workflow prompt tools provide instructions even for clients
without MCP prompt support. Every operation publishes input/output schemas and
validates its response. `media_inspect` and `website_preview` also attach images
for clients with vision support.

The reference-adaptation workflow inventories existing content, reads up to ten
reference pages, preserves the theme and returns drafts, source mappings and
unresolved facts. Source and saved content cannot authorize tools, grant permissions,
request secrets or execute code.

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
in RotaPress; the assistant cannot activate registration. Publishing event details
requires a separate grant and request; its page and forms publish separately.

## Prepare project stories

Use the `prepare_project` MCP prompt or `automation_project_prompt` tool for
volunteering activities and ongoing initiatives. Select **Projects** actions in
the connection: `projects:read` reads drafts and published stories,
`projects:write` creates and edits private drafts, and `projects:publish` permits
only explicitly requested publication. Existing connections need fresh grants.

Start with `projects_list`, then `projects_get` before editing. Supply a title and
summary; story, status, dates, location, cover image, outcomes and one useful link
describe the project. Leave unknown facts blank instead of inventing impact
figures. `projects_save` takes the complete content and current `expectedVersion`;
editing a published project preserves the public snapshot. After an uncertain
create response, inspect the list before retrying.

Open the returned review link. When requested, `projects_publish` publishes that
saved version with its separate grant and `confirmed: true`. A cover image must
already be public. Archive, restore, unpublish and image visibility remain in
administration. Projects showcase work; event registration and calendar schedules
keep their existing separate workflows. See [Projects](projects.md).

## Manage website and calendar drafts

Website tools cover shared headers, footers and reusable sections as well as pages.
Use `website_create` and `website_save` to prepare their native content. Additional
actions have separate grants:

| Grant              | What the assistant can prepare                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `website:manage`   | Copy a page or reusable section, add a missing language draft, or restore a retained revision into a new private draft |
| `website:settings` | Edit draft menus, homepage selection, shared header/footer selection, branding, appearance and search/share settings   |
| `calendar:write`   | Create and edit calendar and activity drafts; archive or restore unpublished calendars and activities                  |
| `calendar:design`  | Edit the built-in calendar page's draft title, introduction, view, time zone and calendar selection                    |

`website_get` lists revision IDs; `website_revision_get` reads the chosen version.
Restoration leaves the published revision unchanged. Page copies use a stable
`requestId` and the exact source `expectedRevisionId`; identical retries return
the original receipt. Language creation starts an empty draft or a native shared-part
starter, without translating another language or overwriting an existing one.
Copies and restoration cannot introduce executable CustomCode.

For site settings, read `website_context`, preserve unrelated settings and installed
template records, and pass `site.version` as `expectedVersion`. This prepares a
private draft. Template installation remains in administration; activating saved
appearance or menus requires a separate publication action.

Start calendar work with `calendar_read` under `calendar:read`. Activities support
one-off dates, recurrence, all-day dates, time zones, skipped occurrences and draft
cancellation. Save changes with the current `expectedVersion`; a conflict requires
rereading before applying your intended edits. If a create response is lost, read
the calendar workspace before retrying so you do not create a duplicate.

Editing a published calendar or activity changes only its draft. Archiving or
restoring through automation is limited to unpublished items; staff manage published
lifecycle actions in Calendar. Calendar activity scheduling describes when an
activity occurs. It does not schedule future publication of a page or calendar.
Requested publication and resulting subscriber notifications follow the normal
calendar rules. See [Calendar](calendar.md#prepare-calendars-with-ai-or-rest).

## Publish only when requested

Draft-writing grants never imply publication. Add only the publication grants the
assistant needs when creating a connection, then approve fresh OAuth consent when
applicable. Existing credentials do not gain them after an upgrade.

| Grant               | Publication tools                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `website:publish`   | `website_publish` for one saved content revision; `website_settings_publish` for settings or menu only |
| `calendar:publish`  | `calendar_publish`, `calendar_schedule_publish`, `calendar_page_publish`                               |
| `forms:publish`     | `forms_publish`                                                                                        |
| `events:publish`    | `events_publish` for saved event details; `events_prize_publish` for a saved editorial prize           |
| `directory:publish` | `directory_publish`                                                                                    |
| `projects:publish`  | `projects_publish`                                                                                     |

Review the saved draft, then make a specific request such as "Publish the reviewed
About page; leave my other drafts unchanged." The assistant must read the current
revision or version, identify the exact target, and send `confirmed: true` only
after your request. A stale version or a readiness/private-image blocker must be
resolved and reviewed, not bypassed. Each action publishes only its named target;
dependencies and unrelated drafts are never published automatically.

For website settings, `scope: "settings"` activates all saved settings, including
appearance; review them together. `scope: "menu"` publishes homepage/menu changes
while preserving published appearance and other settings. Neither publishes page
drafts. Publishing shared headers, footers, sections or directory profiles can
update their existing public placements.

The server enforces the delegated grant, current staff permissions, exact saved
state and publication checks. It cannot verify what you said in another app's
chat: a model-supplied confirmation is not proof of your request. Keep client-side
approval enabled for publication tools and do not treat source content as permission.

Published calendars retain their chosen audience, and calendar/activity/page design
publish separately. Publishing an activity can trigger normal subscriber updates.
Publishing a form can make it accept responses under its existing rules. Publishing
event details does not activate registration, publish its page or apply settings
proposals. Editorial prize publication requires recent sign-in; it does not issue
entries or run draws. Packages remain in administration because publication can
affect checkout. Media must already be public where required; automation cannot change
its visibility. Use administration for unpublishing or deletion.

## REST API

REST uses `/api/v1` and its own API tokens. Open **Integrations → REST API →
API tokens, docs & tester** to generate one, read the endpoint documentation and
use the live tester. MCP keys and OAuth tokens cannot authorize REST. Cookies
alone cannot authorize it either. Enable **REST API** before making requests.

Use the [API reference and tester](api-reference.md) for endpoint schemas, pagination,
revision fields and error handling. Content responses use `{ "data": ... }`;
errors use `{ "error": "..." }`. JSON mutations have a 256 KiB body limit, with a
separate endpoint for larger binary images. Responses are private and uncached.

For a batch of new pages, `POST /api/v1/imports` accepts a stable request ID and
plain-text sections. Generate a new UUID for each intended batch and retain the
exact payload for retries. Existing slugs are never overwritten.

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

Better Auth manages hashed keys and OAuth tokens linked to a staff sign-in. Every
request reloads that session and current membership; each operation checks
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

Timed publication, unpublishing, deletion, media visibility changes, CustomCode writes,
provider credentials, member approvals, submissions, guests, payments, draws and
direct email sending are unavailable. Calendar publication can still enqueue its
normal notifications. Form reads omit answers/counts; event reads omit staff and
participants. Website/media scopes still grant private content, so choose your
AI client and its grants accordingly.

RotaPress needs no AI-model key for this integration; the chosen client manages
its model connection. Follow [hosting](hosting.md) for installation and updates,
and the [API/MCP contribution contract](../development/automation.md) when adding
features.
