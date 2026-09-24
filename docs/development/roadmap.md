# Roadmap and current limits

RotaPress is pre-release. Website editing, membership, forms, events, calendars
and optional integration configuration are implemented with local automated
checks. This is not a claim of production acceptance or live-provider verification.

## Next: local release candidate

Before a production-ready release:

- Demonstrate a clean installation without demo data.
- Supply and exercise database-plus-upload backup and restore into a separate
  disposable installation, preserving separately protected recovery keys.
- Complete update and recovery instructions and review release dependencies.
- Confirm the rights and intended use of bundled branding for the distribution.
- Verify the production build, main user journeys and permissions on the chosen
  deployment configuration before supporting that configuration.

The repository has setup, migration, owner recovery and verification commands.
It does **not** yet supply general `seed:demo`, `backup:local` or `restore:local`
commands. Preserved Docker volumes are not a tested disaster-recovery procedure.

## Integration and hosting limits

| Area | Current boundary |
| --- | --- |
| Google sign-in | Protected configuration and local policy checks; actual provider sign-in still needs credentials and a real run |
| Luma | Links, protected connections, scoped import/notification/purchase workflows with synthetic fixtures; live verification pending |
| Calendar feeds | Local file imports and injected feed checks; real remote feeds require separate verification |
| Email | Server SMTP/Resend bootstrap precedes owner sign-in; development capture is opt-in and prohibited in production mode. Live delivery and total email-lockout recovery remain unverified |
| Domains | Ownership/setup records do not provision DNS, certificates, routing or custom-domain hosting |
| File storage | Persistent local images only; object storage and full recovery remain unverified |
| Production | Hosting, TLS/proxy behavior, origins, cookies, scheduling, rate limits and recovery need a supported deployment recipe |

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
