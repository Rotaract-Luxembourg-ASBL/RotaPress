# Roadmap and current limits

RotaPress is pre-release. It provides website editing, membership, forms, events,
calendars and optional integrations in one application. The boundaries below
describe the supported design and planned work; validate each deployment with its
actual storage, proxy, sender and provider configuration.

## Current product scope

Fresh installation supports atomic template/theme setup, platform-wide Google-only
or email-and-Google sign-in with optional managed-domain configuration, public
club identity fields,
connected Club details blocks, club-name SEO titles and sandboxed custom HTML/JS.
See [website/media](../guides/cms-and-media.md) and
[Google sign-in](../guides/google-authentication.md).

Administration uses compact collection summaries and an action-focused Overview
with review queues, recent drafts and upcoming events. Branding has focused editing
tabs with visible save state, media uses thumbnail selection and previewed uploads,
and Response center keeps secondary filters collapsed. These workflows reuse current
authorization, private-media and deliberate-publication boundaries. See
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
setup guide and tool tests; credentials cannot cross integrations. Grouped action
pickers support select all, clear all and focused presets. Native page schemas
and templates let assistants
prepare website and event drafts; bounded private image uploads and saved-revision
screenshots support visual review. Event settings are suggestions until a staff
member applies them; publication stays manual. Every feature change requires an
API/MCP contract review. See [AI & API](../guides/ai-and-api.md) and the
[workflow architecture](automation-workflows.md).

| Area           | Current boundary                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google sign-in | Requires protected credentials, an exact callback and current Google-session policy; validate actual sign-in on the configured origin                      |
| AI & API       | Native content/media/event drafts, staff-reviewed settings, bearer/stdio and registered OAuth clients; no participant operations or unattended publication |
| Visual preview | Requires pinned Chromium and a supported sandbox; unavailable hosts return `503`. Pixels do not verify interactive controls, delivery or payments          |
| Luma           | Link mode needs no API credentials; scoped import/notification/purchase workflows require a protected connection and the operator request control          |
| Calendar feeds | Native/file calendars work locally; remote feeds require explicit outbound access and comply with the restricted feed client                               |
| Email          | Server SMTP/Resend configuration precedes owner sign-in; development capture is opt-in and prohibited in production mode                                   |
| Domains        | Ownership/setup records do not provision DNS, certificates, routing or custom-domain hosting                                                               |
| File storage   | Persistent disk images with bounded hosted backup/restore; object storage is not implemented                                                               |
| Owner recovery | The local `.test` recovery command is not a hosted email-lockout procedure                                                                                 |
| Hosting        | One application replica, PostgreSQL 17, persistent uploads, trusted HTTPS proxy and the hosted job supervisor                                              |

External provider access defaults to disabled where operator flags apply. Saved
configuration does not establish a working connection or authorize real mail.
The exact setup and restrictions are in the relevant [guides](../README.md).

OAuth implements Better Auth authorization-code consent with S256 PKCE and exact
client registration. A hosted client connection needs a reachable HTTPS
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
- Guest invitation emails, guest documents/forms and larger-list portal browsing.
- General demo seeding and additional storage adapters.

These are limits, not promises of a release date. Proposed contributions should
start with a concrete club need and preserve the existing authorization,
publication and provider boundaries. See [Contributing](../../CONTRIBUTING.md).
