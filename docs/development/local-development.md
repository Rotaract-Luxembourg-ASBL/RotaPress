# RotaPress local development

The local environment is one Node application and this repository's PostgreSQL
container, with private uploaded images in `.data/uploads`. Synthetic development
mail capture is optional and requires no cloud credentials. The [website and media guide](../guides/cms-and-media.md)
describes page editing, publication, languages and image visibility.

## Requirements and first start

Use Node.js 24 to bootstrap installation and a running Docker installation with
Compose. Project scripts use the pinned Node.js 24.21.0 runtime downloaded by pnpm;
setup and doctor reject older runtimes. Windows requires Docker Desktop's Linux
container engine. The scripts report missing prerequisites; they do not install
operating-system software or modify unrelated containers.

Run these commands from the repository root:

```text
node scripts/pnpm.mjs install
node scripts/pnpm.mjs setup --development-mail
node scripts/pnpm.mjs doctor
node scripts/pnpm.mjs dev
```

The bootstrap downloads the exact `packageManager` version, verifies its archive
integrity and keeps its executable and package caches in ignored `.local/`.
It invokes project scripts explicitly. An already-installed matching pnpm works
too, but use `pnpm run setup`: plain `pnpm setup` is pnpm's own shell-configuration
command and does not run this application's setup script.

`devEngines.runtime` pins the project Node version; `pnpm-lock.yaml` records its
download checksums. `pnpm run` and `pnpm exec`, including the bootstrap commands
above, use this runtime. A plain `node` command outside pnpm still uses the system
installation. Check it with `node scripts/pnpm.mjs exec node --version`.
Update the runtime pin and lockfile together when applying security
releases; run doctor and verification afterward. This does not install system-wide
software.

Setup preserves existing secrets and data. It creates dedicated `rotapress` and
`rotapress_test` databases and applies reviewed migrations. The plain `setup`
command leaves email disabled and asks for an owner nomination. For real email,
follow [first-run email setup](../guides/email-setup.md).

## Development email only

`setup --development-mail` explicitly sets `ROTAPRESS_ENVIRONMENT=development`
and `EMAIL_PROVIDER=development`, and starts Compose's `development` profile.
It refuses to replace a configured SMTP/Resend provider or production environment.
It nominates `local-owner@example.test` on a fresh installation; use
`--owner-email another-owner@example.test` for a different synthetic account.

Mailpit captures synthetic messages at `http://127.0.0.1:18025`. Its SMTP and HTTP
ports bind to loopback. This is a developer inspection tool, not proof of real
inbox ownership or production email delivery. Product setup screens never direct
an owner to it. Never enable this profile or provider in production.

The bootstrap writes the private one-hour claim to `.local/setup-claim.txt`.
Use the synthetic development account and claim only in the local environment.
An existing unexpired claim is preserved for the same nominee. Rerun setup after
expiry; changing `--owner-email` before installation replaces the claim.
Completed installations stay locked and rerunning setup cannot create another owner.

Setup also creates a separate `INTEGRATION_ENCRYPTION_KEY` for optional API
credentials, preserving an existing key and refusing to replace a missing key when
saved credentials exist. Keep it with protected recovery secrets. Live Luma API
requests default to blocked; [connection operation](../guides/luma.md#connections) explains
the local fixture, authorization boundary and remaining integration work.

## Server configuration

Setup generates the database connection, authentication and encryption secrets,
plus explicit local environment/email settings in `.env.local`. Preserve the
secrets when restarting, upgrading or restoring. Database migration credentials
remain separate in ignored `.local/` files.

The first SMTP/Resend sender is configured in the **server environment before
sign-in**, using [these settings](../guides/email-setup.md). Administration can
select a replacement sender after installation. Google is configured in
**Administration → Integrations**. Neither provider credentials nor server mail
credentials are exposed in the public setup form.

Existing checkouts no longer get an implicit development mailbox. Choose real
server email, or explicitly opt into `setup --development-mail` for synthetic
local work. This preserves existing integration records and installed content.

Advanced operator controls are optional and default to `false` when absent:

| Control | Permits after separate authorization |
| --- | --- |
| `LUMA_API_REQUESTS_ENABLED` | Live Luma API requests |
| `FORM_WEBHOOK_REQUESTS_ENABLED` | Outgoing form notifications to configured webhooks |
| `CALENDAR_FEED_REQUESTS_ENABLED` | Reads from configured external calendar feeds |
| `EMAIL_REMOTE_DELIVERY_ENABLED` | Delivery through configured SMTP/Resend connections |

These controls restrict outgoing requests independently of provider settings. Saving a
connection in the panel does not override them. An operator can supply an explicit
override and restart the app and jobs after the real integration has been authorized.
Nothing in local setup turns them on or sends real participant email.

Setup preserves an existing encryption key and refuses to generate a replacement
while any encrypted Google, Luma, form webhook, Calendar import or email connection
data exists. Restore the original key with the database backup in that situation.

## Local URLs and protected ownership

| Resource | Address |
| --- | --- |
| Public website | http://127.0.0.1:3000 |
| Administration | http://127.0.0.1:3000/admin |
| Initial setup | http://127.0.0.1:3000/setup |
| Sign in | http://127.0.0.1:3000/sign-in |
| Captured email | http://127.0.0.1:18025 |
| Public health | http://127.0.0.1:3000/api/health |
| PostgreSQL | 127.0.0.1:55432 |
| Mailpit SMTP | 127.0.0.1:11025 |

All published service ports bind to loopback. Do not expose Mailpit or create a
public tunnel. Mailpit captures mail locally and has no external relay configured.

Open `.local/setup-info.json` locally for the nominated address. Real owner
onboarding requires receipt through the configured SMTP/Resend sender, as described
in [first-run email setup](../guides/email-setup.md). Supply the club identity and
the private installation claim to finish. The claim alone cannot grant ownership:
the verified identity must match the nomination. Keep these local files out of Git,
issue descriptions, screenshots and status notes.

The first-run screens show email configuration, owner verification, club details
and the workspace. **About owner access** explains the nominated inbox and private
claim. Club details include Rotary blue and Rotaract cranberry
color presets, plus a custom color. After setup, choose a complete website from
**Website → Templates**; nothing is automatically published. See the
[product identity and reusable brand assets](../guides/rotapress-brand.md).

The generic club accepts email verification. Configure Google from
**Integrations → Google sign-in**; see [setup and security](../guides/google-authentication.md).
Google configuration and its staff
policy are separate; a linked Google account does not turn an email-authenticated
session into a Google session. Live Google OAuth remains unverified until an
authorized actual provider flow is completed. Luma link mode and API connection
storage work locally; live Luma API validation remains unverified.

## Stop, restart and production build

Stop the foreground web application with `Ctrl+C`. These service commands preserve
the PostgreSQL and Mailpit volumes:

```text
node scripts/pnpm.mjs services:stop
node scripts/pnpm.mjs services:start
node scripts/pnpm.mjs services:status
node scripts/pnpm.mjs dev
```

The development launcher also processes pending form notifications and scheduled CMS publication every
30 seconds, starting after five seconds. Ctrl+C stops both the web app and its
active job invocation. A bounded batch can also be run explicitly:

```text
node scripts/pnpm.mjs jobs:run
```

`start` runs the production web server only. While using that command locally,
run `jobs:run` separately to deliver pending notifications and publish due revisions. See
[forms and submissions](../guides/forms.md) and [scheduled publication](../guides/scheduled-publication.md)
for job state, session requirements and retry behavior.

For the production build, stop any existing app using port 3000, then run:

```text
node scripts/pnpm.mjs build
node scripts/pnpm.mjs start
```

Do not use `docker compose down --volumes` as a startup remedy. Setup does not
reset a database or replace another project's port binding. `doctor` checks
actual Docker, service, runtime-role, migration and app-port readiness. The
development capture service is checked only when explicitly configured. Doctor
does not send real email or certify external inbox delivery.

## Database authority and verification

If Windows reserves the default ports, set `APP_URL` in the local runtime
configuration to an available loopback origin and restart `dev`. For example,
use port 4100 for development. For smoke tests and `verify`, PowerShell:

```powershell
$env:ROTAPRESS_SMOKE_PORT = '4101'
node scripts/pnpm.mjs verify
```

The override is validated and binds only to 127.0.0.1. It does not change the
dedicated test database or Windows port reservations.

`.env.local` contains only runtime configuration. The `rotapress_app` role has
no superuser, database creation, role creation or schema creation authority.
Schema ownership and migration credentials live separately in
`.local/migration.env`; container bootstrap secrets are in `.local/services.env`.
The web process never loads those files. Public schema creation and public access
to the application schema are revoked. Audit rows are append-only for the runtime
role; installation and recovery claim issuance require the privileged local tool.
CMS revisions are also append-only for the runtime role. CMS and media tables
remain in the private application schema; browsers use authorized application
routes rather than database credentials.

Migration commands use a PostgreSQL advisory lock. They only accept known local
database identities at the project's fixed loopback port:

```text
node scripts/pnpm.mjs db:generate
node scripts/pnpm.mjs db:migrate
node scripts/pnpm.mjs db:migrate:test
node scripts/pnpm.mjs check
node scripts/pnpm.mjs test:critical
node scripts/pnpm.mjs browser:install
node scripts/pnpm.mjs test:smoke
node scripts/pnpm.mjs verify
```

Critical checks use `.local/test.env` and `rotapress_test`, never the developer
database. Browser checks exercise library email authentication through Mailpit.
Install Chromium once with `browser:install`; it stays in this project's `.local/browsers`.
`test:smoke` requires a completed production build and free loopback port 3001;
`verify` builds before running it and starts/stops its isolated browser server.
See [testing](testing.md) for the critical catalogue and focused commands.
Do not point these scripts at a remote database.

The 800-line checker includes untracked authored files. Its exceptions are
package lockfiles, Drizzle-generated `db/migrations/meta/*.json`, properly marked
generated types, and generated/build/vendor/private-data directories. Generated SQL is checked.

## Local owner recovery

The privileged recovery command requires an existing verified, approved owner:

```text
node scripts/pnpm.mjs recover:owner --email local-owner@example.test
```

It revokes that owner's existing sessions, invalidates prior unused recovery
claims, records an audit entry and writes a 15-minute claim to ignored
`.local/recovery-claim.txt`. Sign in again as that nominated owner and open
`http://127.0.0.1:3000/recovery`. Successful consumption restores the generic
email-or-Google staff policy. It cannot add a new owner, approve an applicant,
recover another identity or reopen installation setup.

Database/file backup and restore commands are not yet supplied.
Do not treat preserved Docker volumes as a tested backup or recovery procedure.

## Dependency versions

Use the pinned manifest, lockfile and container definitions as the version source.
Update them together when applying dependency changes; do not maintain a second
version table in documentation. See [architecture](architecture.md) and
[release limitations](roadmap.md).
