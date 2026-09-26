# Architecture

RotaPress is a modular monolith: one Next.js App Router application, one package
manifest, one PostgreSQL migration history and one Better Auth integration.
Each installation serves one club. Multi-tenant SaaS administration is outside
its current scope.

## Directory layout

```text
.github/                 Issue and pull-request templates
src/
  app/                   Routes, layouts and HTTP entry points
  core/                  Identity, authorization, installation and club settings
  features/              CMS, forms, members, events, calendars and related domains
  integrations/          External provider adapters and protected configuration
  infrastructure/        Database, storage, email and other infrastructure adapters
  composition/           Explicit wiring of concrete services
  ui/                    Shared interface components and styling
  locales/               Interface dictionaries
db/
  schema/                Feature-owned Drizzle definitions
  migrations/            Ordered SQL migrations and generated schema metadata
scripts/                 Project bootstrap, services, migrations, jobs and checks
tests/
  critical/              Scoped security and data-integrity checks
  browser/               Two principal browser journeys and their helpers
public/                  Application assets, template images and asset notices
docs/
  guides/                User and operator workflows
  development/           Setup, architecture, testing, UX and roadmap
  contributing/          Extension contracts
skills/                  Focused repository guidance for coding agents
```

Private runtime files belong in ignored `.env.local`, `.local/` and `.data/`.
Dependencies, build output, screenshots, backups and local session records do
not belong in the distributed source tree.

Hosted operation uses the same application and migrations in a portable Docker
image. The root startup supervisor prepares database roles and forward migrations,
then runs web and bounded jobs as an unprivileged user with restricted credentials.
PostgreSQL and uploads use persistent volumes; HTTPS terminates at the configured
proxy. See the [hosting contract](hosting.md) for secrets, origins and recovery.

## Request and dependency flow

Routes, server components and actions call application services. Services resolve
trusted actor context, enforce current permissions, validate inputs, and use
feature repositories or narrow infrastructure adapters. Database models are not
automatically response DTOs.

Use ordinary constructor injection and composition. Domain services, repositories
and substantial adapters use classes; React components and small transformations
use functions. There is no DI container, universal repository or inherited service
hierarchy. Shared UI components receive values and callbacks; they do not own
feature authorization.

External providers remain behind explicit adapters. Core identity and permissions
must not depend on Luma or a particular club's branding. Extensions are reviewed,
build-time code contributions, not uploaded executable plugins.

## Identity and authorization

Better Auth owns email OTP, Google flows, sessions and account linking. An
expiring one-use setup claim also requires the nominated verified identity before
an installation can acquire its first owner. No default password or hidden local
login bypass exists.

The operator supplies the initial SMTP/Resend sender through protected server
configuration before owner sign-in. Until installation completes, email codes
can only be sent to the nominated owner with a valid claim. Admin sender settings
can override that server sender after installation; a missing or failing provider
never falls back to development capture. The optional development provider is
restricted to explicit development/test mode and loopback origins/databases.

Identity, approved membership, staff capability, event assignment and guest
entitlement are separate. Every private operation checks current trusted scope;
client roles, organization IDs and feature flags cannot grant authority. A linked
Google account cannot satisfy Google-only policy without a current Google
session. The saved login choice applies to staff, members and guests; email-code
endpoints and existing email sessions are rejected while Google only is selected.
Initial protected owner setup precedes this policy. The existing `staffAuthPolicy`
storage/API name is retained for compatibility; its choice is platform-wide.
Sensitive owner and integration changes require recent authentication.

The content automation layer exposes versioned REST and MCP through one operation
catalogue. Each transport defaults to disabled. Better Auth owns session-bound
connection keys and OAuth tokens; operations recheck current scope and call the
existing domain services. Content and media writes remain private. Settings that
lack a draft model use typed proposals for staff review. See the
[workflow architecture](automation-workflows.md) and
[API/MCP extension contract](automation.md).

## PostgreSQL and migrations

Application tables live in the private `club` schema. The web process uses a
restricted runtime role, separate from schema ownership and migration credentials.
Browsers never connect directly to the database. Authorization is enforced by the
backend; this project does not claim per-user database RLS coverage.

Services use parameterized queries, deliberate transactions and constraints for
scope, uniqueness and concurrency. Migrations are ordered, reviewed SQL applied
through the project's locked migration command. Do not rewrite migrations merely
to tidy their generated filenames: existing databases depend on that history.
Runtime feature toggles never install or drop tables.

Keep schema snapshots and the migration journal with their SQL. They are required
migration tooling artifacts, not disposable documentation. Generated SQL remains
subject to the 800-line authored-file limit.

## Publication and files

CMS pages, shared parts and settings separate editable drafts from explicit
published snapshots. Expected versions prevent silent overwrites. Restoring a
revision creates a draft; it does not republish. Public readers project published
fields only, while private previews require current authorization and avoid shared
caching. Event pages reuse the CMS schema, renderer and revision services.

Uploaded images start private, are validated and normalized, and live outside
the web root. Publication checks ownership and deliberate public visibility.
Retained references protect media used by earlier revisions. Storage metadata is
in PostgreSQL; actual file bytes are separate and must be included in recovery.

## Feature lifecycle

Built-in availability and event feature activation are server-enforced. Effective
availability also requires permissions, dependencies and any active provider
connection. Disabling preserves records and history while stopping new operations.
Re-enabling cannot silently replay old queued notifications or imports.

Copying a template or event creates editable configuration and content. It does
not copy participants, purchases, credentials or guest entitlements, and does not
automatically publish the result.

## Jobs and provider boundaries

PostgreSQL holds bounded durable notification and scheduling work. The development
launcher and hosted supervisor periodically invoke the application's `jobs:run`
command. The standalone `start` command runs only the web server; an operator
using it outside the hosted supervisor must invoke jobs separately. There is no
Redis or separate task platform. See [local development](local-development.md) and
the [hosting contract](hosting.md) for the two launch modes.

Workers recheck current scope and lifecycle, lease work, bound retries and preserve
failure state. External requests have time/size limits and constrained destinations.
Integration credentials remain server-only and encrypted with a separate key.
Provider notifications and purchase observations cannot by themselves establish
membership, payment or prize eligibility.

## Project constraints

TypeScript is strict. Boundaries use validation and narrow DTOs. Every authored
source, script, configuration, SQL migration, test and Markdown file has an
800-physical-line maximum. The checker excludes documented machine lockfiles,
Drizzle JSON metadata, marked generated types and generated/private directories;
its exceptions must not hide authored logic.

Use [testing](testing.md), [product UX rules](product-ux.md) and
[Contributing](../../CONTRIBUTING.md) for change practices. See the
[roadmap](roadmap.md) for current limits and planned work.
