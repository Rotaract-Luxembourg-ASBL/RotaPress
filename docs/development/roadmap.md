# Roadmap and current limits

RotaPress is pre-release. Website editing, membership, forms, events, calendars
and optional integration configuration are implemented with local automated
checks. This is not a claim of production acceptance or live-provider verification.

## Next: local release candidate

Fresh-installation improvements include atomic template/theme setup, a Google-only
staff screen with optional managed-domain configuration, richer public club identity,
connected Club details blocks, club-name SEO titles and sandboxed custom HTML/JS.
See [website/media](../guides/cms-and-media.md) and
[Google sign-in](../guides/google-authentication.md). A successful local check or
deployment still does not establish a completed live Google sign-in.

Before a production-ready release:

- Demonstrate clean installation and first-owner setup on a public host without demo data.
- Exercise the portable hosting recipe on a chosen public host, including real
  certificates, inbox delivery and off-site recovery of a representative club.
- Complete update and recovery instructions and review release dependencies.
- Confirm the rights and intended use of bundled branding for the distribution.
- Verify the production build, main user journeys and permissions on the chosen
  deployment configuration before supporting that configuration.

The repository supplies local setup and a portable Docker hosting assistant with
automatic migrations, persistent uploads, jobs, backup and fresh-stack restore.
The container rehearsal checks database-plus-upload recovery with protected keys;
live-host recovery remains a release gate. It does not supply general `seed:demo`,
`backup:local` or `restore:local` commands for the separate development environment.
See [hosting](../guides/hosting.md).

## Integration and hosting limits

Content automation supplies versioned REST, MCP tools/resources/prompts and scoped,
expiring staff connections. REST API and MCP are separately enabled in Integrations
and both default to disabled. Native page schemas and templates let assistants
prepare website and event drafts; bounded private image uploads and saved-revision
screenshots support visual review. Event settings are suggestions until a staff
member applies them; publication stays manual. Every feature change requires an
API/MCP contract review. See [AI & API](../guides/ai-and-api.md) and the
[workflow phases and acceptance boundaries](automation-workflows.md).

| Area           | Current boundary                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google sign-in | Protected configuration and local policy checks; actual provider sign-in still needs credentials and a real run                                                                        |
| AI & API       | Native content/media/event drafts, isolated visual previews, staff-reviewed settings, bearer/stdio and predefined OAuth clients; actual external-client acceptance remains separate    |
| Visual preview | Pinned Chromium and a supported sandboxed runtime are required; saved pixels do not verify interactive controls, delivery or payments                                                  |
| Luma           | Links, protected connections, scoped import/notification/purchase workflows with synthetic fixtures; live verification pending                                                         |
| Calendar feeds | Local file imports and injected feed checks; real remote feeds require separate verification                                                                                           |
| Email          | Server SMTP/Resend bootstrap precedes owner sign-in; development capture is opt-in and prohibited in production mode. Live delivery and total email-lockout recovery remain unverified |
| Domains        | Ownership/setup records do not provision DNS, certificates, routing or custom-domain hosting                                                                                           |
| File storage   | Persistent disk images with bounded backup/restore; object storage is not implemented                                                                                                  |
| Production     | Portable Docker recipe with automatic bootstrap/migrations, HTTPS proxy, jobs and recovery; chosen public host and live-provider acceptance remain pending                             |

External provider access defaults to disabled where operator flags apply. Saved
configuration does not establish a working connection or authorize real mail.
The exact setup and restrictions are in the relevant [guides](../README.md).

OAuth implements Better Auth authorization-code consent with S256 PKCE and exact
client registration. A real hosted client connection still needs a reachable HTTPS
installation, the client's supported configuration and a completed consent/revoke
check. Local fixtures or browser journeys do not prove ChatGPT/Claude acceptance.
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
