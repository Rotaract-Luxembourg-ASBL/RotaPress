# Security Policy

## Report a vulnerability

Email **[abuse@rotaract.lu](mailto:abuse@rotaract.lu)** with the subject
`RotaPress security report`. Please report privately before opening a public
issue or pull request containing exploit details.

Include the affected version or commit, the relevant feature, expected and actual
behavior, impact, and a minimal reproduction using synthetic data. Redact session
cookies, passwords, API keys, setup claims and participant information. If sensitive
evidence is necessary, ask for an appropriate transfer method before sending it.

Maintainers will assess the report, request clarification where needed and
coordinate a fix and disclosure with the reporter. This volunteer project cannot
promise a response deadline, bounty or third-party assessment.

## Supported versions

RotaPress is pre-release. Security fixes target the current development version;
there are no maintained release branches or backport commitments yet. Production
hosting, full database-plus-files recovery and real-provider verification remain
open work in the [roadmap](docs/development/roadmap.md).

## Test responsibly

Use an installation you own or have explicit permission to test. Local setup and
the dedicated test database support synthetic security reproductions without
touching a club's live website, real accounts or participant records. Do not use
production credentials or send real participant mail during routine testing.

## Security design

Private operations authorize current sessions, membership and resource scope on
the server. Authentication alone grants no staff, membership or guest entitlement.
Drafts and private files stay out of public projections. Runtime database access
uses a restricted role; credentials and local diagnostics are excluded from Git.

These are design requirements, not a claim of an exhaustive audit. See
[architecture](docs/development/architecture.md), [testing](docs/development/testing.md)
and feature guides for implemented boundaries. Confirmed access bypass, data
exposure, credential leakage or corruption needs a fix and focused regression.
