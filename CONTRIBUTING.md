# Contributing to RotaPress

Contributions that help clubs run their websites and activities are welcome.
Please follow the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities
privately through [SECURITY.md](SECURITY.md).

## Before starting

Search existing issues and pull requests for the problem. For a substantial
feature, discuss the user need and scope before building it. Small fixes and
documentation corrections can go straight to a pull request.

Read the [architecture](docs/development/architecture.md),
[roadmap](docs/development/roadmap.md) and relevant [feature guide](docs/README.md).
Continue the existing application; do not introduce another authentication
system, database engine or content engine.

## Development setup

Fork the repository, clone your fork and create a branch for your change. Follow
[local development](docs/development/local-development.md) for prerequisites and owner setup.

```sh
node scripts/pnpm.mjs install
node scripts/pnpm.mjs setup --development-mail
node scripts/pnpm.mjs dev
```

Use synthetic records and Mailpit. Keep credentials, setup claims, uploads,
participant information and local diagnostics out of commits and screenshots.
Do not reset another developer's data or unrelated Docker volumes.

## Make a focused change

- Use strict types, validated inputs, narrow response DTOs and parameterized SQL.
  Services own current authorization and transactions; browser roles are not authority.
- Use composed service/repository classes with constructor injection where useful.
  React components and hooks remain functions. Avoid general-purpose frameworks
  for a single feature.
- Keep authored source, scripts, configuration, SQL and Markdown within **800
  physical lines per file**. Split by responsibility, not arbitrary line counts.
  Preserve the existing source-size checker and its narrow generated exceptions.
- Commit reviewed forward-only migrations with schema changes. The runtime
  database role remains restricted; feature toggles never create or drop tables.
- Update the relevant guide when behavior changes. Keep development diaries,
  machine-specific screenshots and command transcripts outside public docs.

For interface changes, use the [product UX rules](docs/development/product-ux.md)
and [workflow skill](skills/rotapress-product-ux/SKILL.md). Walk through the complete
task on desktop and phone, including errors, saving and publication. Public
branding must remain separate from administration styling.

Website templates follow the [template authoring skill](skills/rotapress-website-template/SKILL.md).
Calendar providers have a [contribution contract](docs/contributing/calendar-providers.md);
email providers use the [mail contract](docs/guides/email.md#contributor-contract).
These are reviewed code extensions, not uploaded executable plugins.

## Verify your work

Run the smallest affected checks while editing. Use real PostgreSQL for scope,
constraints and transaction behavior; use synthetic transports for external providers.
Security fixes need a focused regression at the layer owning the failure.

For a completed application change:

```sh
node scripts/pnpm.mjs browser:install
node scripts/pnpm.mjs verify
node scripts/pnpm.mjs doctor
```

For documentation-only changes, check file sizes, relative links and
`git diff --check`; an unchanged application does not need another browser run.
See [testing](docs/development/testing.md) for focused commands and the check catalogue.

## Open a pull request

Explain the problem, what users can now do, and any remaining limits. Include
the commands you ran and their actual results. State which behavior uses local
fixtures and which, if any, was verified against a real external provider.
For interface changes, include synthetic-data screenshots when useful.

Keep the diff focused and review it for secrets, unrelated changes and generated
output. Public release, external services and deployment are separate maintainer
decisions. Never send real participant email as part of routine verification.

Contributions are made under the existing [MIT license](LICENSE). Preserve
third-party notices and document the source and terms of any added assets.
