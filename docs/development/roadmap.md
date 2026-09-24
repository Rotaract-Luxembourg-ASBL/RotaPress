# Roadmap and current limits

RotaPress is pre-release. Website editing, membership, forms, events, calendars
and optional integration configuration are implemented with local automated
checks. This is not a claim of production acceptance or live-provider verification.

## Next: local release candidate

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

| Area | Current boundary |
| --- | --- |
| Google sign-in | Protected configuration and local policy checks; actual provider sign-in still needs credentials and a real run |
| Luma | Links, protected connections, scoped import/notification/purchase workflows with synthetic fixtures; live verification pending |
| Calendar feeds | Local file imports and injected feed checks; real remote feeds require separate verification |
| Email | Server SMTP/Resend bootstrap precedes owner sign-in; development capture is opt-in and prohibited in production mode. Live delivery and total email-lockout recovery remain unverified |
| Domains | Ownership/setup records do not provision DNS, certificates, routing or custom-domain hosting |
| File storage | Persistent disk images with bounded backup/restore; object storage is not implemented |
| Production | Portable Docker recipe with automatic bootstrap/migrations, HTTPS proxy, jobs and recovery; chosen public host and live-provider acceptance remain pending |

External provider access defaults to disabled where operator flags apply. Saved
configuration does not establish a working connection or authorize real mail.
The exact setup and restrictions are in the relevant [guides](../README.md).

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
