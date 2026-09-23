# Agent instructions

RotaPress is one Next.js App Router TypeScript application for clubs and nonprofit
organizations. Continue the existing implementation; do not scaffold a replacement.

## Before changing anything

Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md),
[architecture](docs/development/architecture.md), [testing](docs/development/testing.md)
and the [roadmap](docs/development/roadmap.md), then the relevant feature guide.
Inspect Git state and preserve owner changes. Explicit task scope takes priority
above the roadmap.

The original blueprints and implementation receipts have been retired from the
public tree. If present, `.local/STATUS.md` contains local handover information;
it is not a prerequisite for a fresh clone. Keep public documentation about the
product, not a transcript of agent sessions.

## Fixed decisions

Use PostgreSQL 17, Drizzle with `pg`, Better Auth, Puck, local file storage and SMTP
in one Node application. Use the project pnpm wrapper and pinned manifest/lockfile.
Do not add another database engine, authentication system, content engine,
microservice, generic job engine or executable plugin marketplace.

Use small composed classes for services, repositories and adapters where warranted;
plain constructor injection; functions for React components and hooks. Keep strict
types, boundary validation, narrow DTOs, parameterized SQL and deliberate transactions.
No broad `any`, ignored build errors or blanket lint suppression.

Every authored source, script, configuration, migration, test and Markdown file
must stay within **800 physical lines**, including comments and blanks. Use
`node scripts/pnpm.mjs check:files`; never weaken the checker or disguise oversized
code as generated output. Split responsibilities coherently and remove dead code.

## Security and data

- Authorize every private operation on the server using current trusted identity,
  membership, organization, event and guest scope. Browser fields are not authority.
- Authentication is not membership approval. Google-only staff policy requires a
  current Google-authenticated session, not just a linked account.
- Better Auth owns sessions, tokens and account linking. Owner setup requires an
  expiring claim and verified nominated identity. Never add a login bypass.
- Protect drafts, private files, responses and guest records from public routes
  and caches. Sanitize CMS input, restrict uploads and provider requests, and
  rate limit public and authentication boundaries.
- Keep application tables private and runtime credentials restricted. Use reviewed,
  forward-only migrations; never reset a developer database to make a test pass.
- Never log or commit secrets or private participant data. Provider notifications
  cannot prove payment, membership or prize eligibility.
- Fix confirmed authorization bypass, exposure, leakage or corruption and add a
  focused regression. Do not suppress a security failure to complete a task.

## Product changes

For interface or workflow work, read and apply the
[product UX skill](skills/rotapress-product-ux/SKILL.md) and
[product UX rules](docs/development/product-ux.md). Inspect the current behavior
and complete the person's task, including saved state, errors, permissions and
phone layouts. Keep public theming separate from administration styling.

For website templates, use the
[template skill](skills/rotapress-website-template/SKILL.md). Preserve shared CMS
services, publication rules and asset provenance.

## Local work and boundaries

Project dependencies, isolated local containers, generated local secrets, dedicated
local migrations and synthetic fixtures are allowed when needed for the task.
Bind services to loopback and preserve unrelated repositories, files and containers.

Do not install system-wide software, read unrelated credential stores, discard owner
changes, force-push, publish, deploy, create public tunnels, alter DNS, contact
sponsors, send real participant email or touch live provider accounts without
explicit authorization. MIT is already the code license; artwork rights and real
paid draw activation remain separate decisions.

## Verification and handover

Run the smallest affected checks while editing. Use real PostgreSQL for dangerous
data behavior and extend the two principal browser journeys when needed. Run full
`verify` once for a completed application slice, not repeatedly for unchanged code.
For documentation-only changes, check file size, links and the full diff.

Report exact commands/results, what changed, limits and the next incomplete item.
Update the relevant public guide or roadmap for durable product changes. Put local
URLs, command receipts and machine-specific handover notes in `.local/STATUS.md`.
Distinguish fixture checks, local verification and actual live-provider results.
Do not claim deployment, publication or acceptance without direct evidence.
