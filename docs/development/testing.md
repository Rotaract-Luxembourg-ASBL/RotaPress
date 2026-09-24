# Testing

Run local [setup](local-development.md) first. The development database is
`rotapress`; critical and browser checks use the separate disposable
`rotapress_test` database. Never point tests at a real club's installation.

## Commands

Run from the repository root:

```sh
node scripts/pnpm.mjs check:files
node scripts/pnpm.mjs check
node scripts/pnpm.mjs test:critical
node scripts/pnpm.mjs browser:install
node scripts/pnpm.mjs build
node scripts/pnpm.mjs test:smoke
```

`check` runs source size, strict types and lint. `browser:install` downloads
Chromium into the project's ignored local directory and is needed only once per
browser version. `test:smoke` expects an existing production build and launches
its own server on loopback port 3001.

The normal application completion check combines these steps:

```sh
node scripts/pnpm.mjs verify
node scripts/pnpm.mjs doctor
```

`verify` runs checks, critical tests, build and browser journeys in order.
`doctor` separately checks local prerequisites, services and runtime configuration.
A documentation-only change needs file-size, relative-link and diff inspection;
it does not require repeating unchanged application tests.

For a focused change, use the owning test group, for example:

```sh
node scripts/pnpm.mjs exec vitest run tests/critical/cms.test.ts -t C03
node scripts/pnpm.mjs test:smoke tests/browser/cms.spec.ts
```

If the default browser port is unavailable, set `ROTAPRESS_SMOKE_PORT` to an
unused port for the command. In PowerShell:

```powershell
$env:ROTAPRESS_SMOKE_PORT = '4101'
node scripts/pnpm.mjs verify
```

## Critical scenarios

These identifiers group risks, not quotas or one test per class. Test at the
layer owning the behavior, with real PostgreSQL for constraints and scoped data.

| Group | Boundary |
| --- | --- |
| C01 | Protected owner setup: identity, expiry, replay and races |
| C02 | Current membership, roles, staff authentication method and settings scope |
| C03 | Draft privacy, stale edits, publication and revision restoration |
| C04 | CMS sanitization, uploads and private media |
| C05 | Form versions, submission replay, delivery persistence and protected exports |
| C06 | Event scope, publication, features and preserved lifecycle history |
| C07 | Registration capacity, uniqueness and concurrent request replay |
| C08 | Provider scope, credentials, pagination, replay and partial failures |
| C09 | Durable job replay, cancellation and stale publication work |
| C10 | Explicit guest ownership, grants and immutable purchase evidence |
| C11 | Demonstration entry decisions, frozen draws, replay and public winner privacy |
| C12 | Portable container startup, migration replay, restricted roles, claim expiry, HTTPS, database-plus-files restore and overwrite refusal; public deployment acceptance is separate |
| C13 | Calendar audiences, time zones, recurrence, import safety and owned subscriptions |

Fix a confirmed authorization bypass, exposure or corruption with a focused
regression. Do not disable a security assertion to complete a slice.

## Browser journeys

- **B01**, `tests/browser/identity.spec.ts`: protected installation, real email OTP,
  private setup-link exchange, membership and scoped administration/event/guest workflows.
- **B02**, `tests/browser/cms.spec.ts`: visual editing, publication, media, forms,
  website templates and calendar interactions.

Helpers extend these journeys rather than creating a browser matrix. Check
changed workflows at desktop and phone widths, including keyboard navigation,
errors, persisted values and draft/public boundaries. Screenshots use synthetic
data and remain local; a screenshot alone does not establish feature correctness.

Mailpit exercises actual local email delivery. Injected Luma, calendar and email
transports exercise adapter behavior without real provider calls. Google policy
checks do not simulate a successful live callback. Report these distinctions in
the pull request and retain exact command outcomes in local handover notes.

## Migrations and generated files

For a hosting change, also run the isolated Docker rehearsal described in the
[hosting contract](hosting.md#recovery-and-validation). It uses real PostgreSQL
17 and persistent upload volumes in unique disposable stacks, internal test TLS,
and synthetic sender configuration without sending email. It leaves the normal
development/test databases alone. It does not prove public TLS or live delivery.

Schema changes need a clean replay in an explicitly disposable project target.
Do not drop developer data, alter unrelated volumes or rewrite applied migrations.
The normal setup/migration commands preserve existing data.

Keep the lockfile and Drizzle metadata. Do not add generated application output,
local browser captures or test reports to Git. The 800-line checker includes
untracked authored files and SQL; documented generated exceptions remain narrow.
