# Roadmap and current limits

The coordinated [platform redesign roadmap](platform-redesign.md) tracks the
administration, authoring, media and assistant upgrade and its acceptance
boundaries. Source capabilities are not a claim that a particular deployment has
been upgraded or accepted.

RotaPress is pre-release. It provides website editing, membership, forms, events,
calendars and optional integrations in one application. The boundaries below
describe the supported design and planned work; validate each deployment with its
actual storage, proxy, sender and provider configuration.

## Current product scope

The page editor groups its block library by content, layout and connected sources,
keeps column insertion and selected-block location explicit, and provides source
status and recovery actions for connected content. Source management stays in its
own workspace and opens without discarding the page draft. The editor retains
separate save/publication, language and audience boundaries; these controls do not
test external provider connections. See [website editing](../guides/cms-and-media.md).

Native photograph sections support canvas-bounded website width, taller hero
photos and overlaid copy panels, photo-background feature sections, and manually
controlled multi-photo strips. Older saved blocks keep their existing layout.
These use the shared editor, media references and publication checks; selecting an
image in a block never changes its saved visibility.

Projects provides a simple showcase for volunteer actions and community
initiatives, with private drafts, reviewed publication, reversible archival,
public stories and a connected website block. It reuses website content
permissions and published club branding. Separate story translations, volunteer
sign-ups and automatic impact calculations are outside this version. See
[Projects](../guides/projects.md).

Fresh installation supports atomic template/theme setup, platform-wide Google-only
or email-and-Google sign-in with optional managed-domain configuration, public
club identity fields,
connected Club details blocks, club-name SEO titles and sandboxed custom HTML/JS.
See [website/media](../guides/cms-and-media.md) and
[Google sign-in](../guides/google-authentication.md).

Administration uses compact collection summaries and an action-focused Overview
with review queues, recent drafts and upcoming events. Branding has focused editing
tabs with visible save state, and Response center keeps secondary filters collapsed.
Media provides grid/list browsing, server-filtered pages, multiple-file uploads,
attachment details and exact selected batches for visibility, tags, collections
and protected deletion. Bounded thumbnails reduce library downloads; photograph
editing can crop, rotate, flip and downscale into a separate saved copy with
unfinished-edit undo/redo. Native Gallery blocks have a shared multi-image composer
with ordering, captions and alternative text, preserving existing block fields.
Single-image and gallery popups also expose selected library-management batches
with preserved insertion/composition state and recoverable stale edits.
Event-scoped pickers retain their approved public collection without management
actions. Administration uploads default public with an explicit private choice;
existing images keep their saved visibility. Automation uploads
remain private and require the existing separate reviewed-publication grant.
These workflows reuse current authorization and retained-reference protection. See
[administration workspaces](admin-workspaces.md) for count scope and interaction rules.

The repository supplies local setup and a portable Docker hosting assistant with
automatic migrations, persistent uploads, jobs, backup and fresh-stack restore.
See [hosting](../guides/hosting.md) for operating instructions and
[testing](testing.md) for local verification.

## Release priorities

- Validate clean installation and first-owner setup without demo data on each
  supported hosting configuration.
- Exercise real certificates, inbox delivery, provider callbacks and off-site
  recovery of representative club data on that configuration.
- Verify updates and restoration with matching database, uploads and protected
  keys; the isolated container rehearsal cannot establish live-host recovery.
- Review dependency advisories and the licenses/provenance of distributed artwork.
- Verify the production build, principal user journeys and permissions before
  documenting support for a deployment configuration.

## Integration and hosting limits

Content automation supplies versioned REST, MCP tools/resources/prompts and scoped,
expiring staff connections. REST API and MCP are separately enabled in Integrations
and both default to disabled. REST has its own token management, endpoint
documentation and live tester. MCP has separate OAuth/access-key connections, a
setup guide and tool tests; credentials cannot cross integrations except that an
export connection can download its own export through the dedicated authenticated
download route. Grouped action
pickers support select all, clear all and focused presets. MCP OAuth setup fills
documented ChatGPT and Claude connector settings from an AI-app picker, with manual
overrides in Advanced; it does not discover arbitrary platforms or account callbacks.
Native page schemas and templates let assistants prepare website and event drafts.
Additional actions cover page copies, languages, revision restoration,
draft menus/appearance, calendars, recurring activities and calendar page design.
OAuth connections have a separate **Existing connections** tab with editable
permissions/reference origins, saved-consent status and recent tool activity.
Permission changes preserve client credentials, invalidate existing tokens and
require fresh consent; access keys still require replacement for new grants.
OAuth access revocation also preserves client credentials while invalidating
tokens, pending authorization codes and saved consent. Permanent connection
removal is a separate action. A dedicated connection handoff retains the consent
destination through sign-out/sign-in, and invalid registrations have their own
recovery page instead of falling through to the member portal.
Consent explains requested versus allowed actions and lets the person review the
full allowed set before explicitly approving it. MCP initialization and capability
discovery expose the issued scope names, labels and read/write mode. Contract 2.0.0
adds explicit participant, operational, file and lifecycle permissions alongside
the existing domain rules and approved-source image imports. Website
recreation includes a focused authoring preset, with Project reading/writing when
the feature is enabled, bounded ordered source outlines
with h1–h6 levels and same-origin image metadata, and separately requested
`media_publish` batches of 1–50 reviewed images. Uploads remain private; image
publication needs `media:publish`, confirmation and current fingerprints, and
preserves metadata/bytes atomically. Separate management grants authorize image
hiding/deletion and public metadata editing. Existing connections require new grants and consent or
new keys, plus an AI-client tool refresh. Source reads do not capture CSS, scripts,
screenshots or image bytes; clients compose native blocks and compare source
visuals with saved previews at desktop/phone widths. Approved bare domains cover
HTTPS on the domain and its subdomains; saved HTTPS-origin rules retain exact
coverage until an explicit change and fresh consent. `source_image_import` uses
both source-reading and media-writing grants to fetch a rights-approved image
through checked HTTPS/DNS/robots boundaries, normalize it as a private asset and
reuse a stable request ID bound to the source URL, image bytes and metadata. This
avoids requiring client-side binary image fetching.
Recreation prompts inventory the requested source and existing target in batches,
reuse the intended homepage, compose native layouts, inspect exact saved previews
and execute already-requested publication in dependency order. They report each
target's actual saved, published and reviewed state rather than declaring a text
import or partial publication a complete copy. Source screenshots still depend on
the client's browser/vision tools. Ordinary MCP page captures use published
appearance; composed previews explicitly pin the draft appearance, menus and
shared revisions together with the page revision.
Platform-wide sensitive actions use a 12-hour sign-in window, with earlier identity
confirmation after a detected browser or trusted-proxy network change.
Bounded private file uploads and saved-revision
screenshots support visual review. Requested event settings and other mutations
execute directly under granted permissions, with version checks and durable
execution receipts. Separate grants allow explicitly requested publication of exact
saved website, calendar, form, event-detail, project, directory and media targets. Server checks
retain readiness, media visibility, current authority and revision/version guards;
dependencies never publish automatically. The AI client must honor the user's
request and retain the client's tool-approval controls without repeatedly asking
for the same authorized action. Every feature change requires an
API/MCP contract review. See [AI & API](../guides/ai-and-api.md) and the
[workflow architecture](automation-workflows.md).

| Area           | Current boundary                                                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google sign-in | Requires protected credentials, an exact callback and current Google-session policy; validate actual sign-in on the configured origin                                                                                            |
| AI & API       | Explicit grants govern requested content, member, response, registration, guest and event operations. Existing grants do not expand automatically. Payment processing, campaigns, check-in and real prize draws remain excluded. |
| Visual preview | Requires pinned Chromium and a supported sandbox; unavailable hosts return `503`. Pixels do not verify interactive controls, delivery or payments                                                                                |
| Luma           | Link mode needs no API credentials; scoped import/notification/purchase workflows require a protected connection and the operator request control                                                                                |
| Calendar feeds | Native/file calendars work locally; remote feeds require explicit outbound access and comply with the restricted feed client                                                                                                     |
| Email          | Server SMTP/Resend configuration precedes owner sign-in; development capture is opt-in and prohibited in production mode                                                                                                         |
| Domains        | Ownership/setup records do not provision DNS, certificates, routing or custom-domain hosting                                                                                                                                     |
| File storage   | Local JPEG/PNG/WebP images, PDF documents, MP3/AAC-LC audio and supported MP4/WebM video with bounded resumable uploads, authorized ranges and streamed backup/restore; object storage is not implemented                        |
| Owner recovery | The local `.test` recovery command is not a hosted email-lockout procedure                                                                                                                                                       |
| Hosting        | One application replica, PostgreSQL 17, persistent uploads, trusted HTTPS proxy and the hosted job supervisor                                                                                                                    |

External provider access defaults to disabled where operator flags apply. Saved
configuration does not establish a working connection or authorize real mail.
The exact setup and restrictions are in the relevant [guides](../README.md).

OAuth implements Better Auth authorization-code consent with S256 PKCE and exact
client registration. **Keep connected** defaults to selected, with five-minute
access tokens and rotating refresh tokens lasting up to seven days while the
originating staff session remains valid. Unchanged consent can be remembered;
new grants still need approval. AI-app linking and tool-approval prompts remain
client-controlled. A hosted client connection needs a reachable HTTPS
installation and a supported client configuration. Verify consent, tool use and
revocation in that client; local fixtures cannot establish ChatGPT/Claude support.
See [OAuth setup](../guides/automation-oauth.md) and
[visual-preview requirements](../guides/automation-preview.md).

## Deferred product work

- Online check-in and matching, and migration/import from an existing event site.
- Native paid checkout, payment processing and issuing refunds.
- Real paid entry activation and real prize draws; current entry/draw tools are
  explicit demonstrations requiring separate event rules before any real use.
- General anonymous attachments, signatures, multilingual form definitions and
  booking-aware response erasure.
- Guest invitation emails and guest documents/forms.
- General demo seeding and additional storage adapters.

These are limits, not promises of a release date. Proposed contributions should
start with a concrete club need and preserve the existing authorization,
publication and provider boundaries. See [Contributing](../../CONTRIBUTING.md).
