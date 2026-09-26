# Security testing

Assess the application with synthetic data on a loopback installation and the
dedicated `rotapress_test` database. Never point these checks at a live club.
Follow the [security policy](../../SECURITY.md) for private reporting and
[testing guide](testing.md) for local prerequisites.

Use the [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
as a review checklist, alongside the
[MCP security guidance](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices)
and [Better Auth security reference](https://better-auth.com/docs/reference/security).
This is a repeatable review method, not certification or a guarantee that the
application cannot be exploited.

## Review the trust boundaries

Start with the route, operation and data inventories. Trace each private read and
write through current identity, membership, capability and resource ownership to
the database query and response projection. Include anonymous visitors, pending
and suspended members, limited staff, event guests, revoked sessions and scoped
automation connections. A legitimate owner's successful request is only the
positive control; repeat it with an unrelated identity and forged authority fields.

| Surface             | Required checks and existing regression locations                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup and recovery  | Verified nominated identity, expiring one-use claim, replay/races, recent sign-in, and per-identity attempt isolation: `membership.test.ts`, `hosting.test.ts`, `owner-endpoint-boundary.test.ts`            |
| Authentication      | Better Auth route allowlist, real session lookup, current Google session policy, callback claims, origin checks and revocation: `auth_boundary.test.ts`, `google-auth.test.ts`, B01                          |
| Private API         | Server authorization on every path, organization/event/record scope, strict input, bounded bodies, no-store responses and generic internal errors: B01 `api-security-journey.ts`, owning domain tests        |
| REST and MCP        | Identical scopes/services, unknown-tool denial, closed outputs, session/key revocation, separately granted exact-target publication and no participant/credential operations: C14 and B01 automation helpers |
| CMS and files       | Private revisions/previews/media, nested sanitization, validated media references, safe upload types, bounded decoding and storage paths: `cms.test.ts`, `media.test.ts`, `media_boundary.test.ts`, B02      |
| Custom HTML/JS      | Opaque frame origin, parent/cookie/storage isolation, top-navigation denial and blocked network probes in authenticated draft preview and public desktop/phone pages: B02 `custom-code-security.ts`          |
| Untrusted content   | Obfuscated XSS, forged authority/prototype keys, private/mixed DNS targets and spreadsheet formula prefixes: `adversarial-content.test.ts`                                                                   |
| Forms and events    | Current form version, private answers/exports, scoped guest records, idempotency, capacity and transaction races: C05-C11 tests                                                                              |
| Outbound requests   | Approved origins, public DNS pinning, redirect refusal, no forwarded cookies/credentials, byte/time limits: `automation-boundary.test.ts`, calendar and webhook tests                                        |
| Provider input      | Signature, event/source/guest scope, deduplication and replay; notifications never confer entitlement: Luma, inbox and event tests                                                                           |
| Hosting and secrets | Restricted runtime database role, forward-only migrations, storage separation, protected environment variables and excluded build artifacts: C12 and the hosting rehearsal                                   |

Critical test filenames above are under `tests/critical`; B01/B02 helpers are
under `tests/browser`. Read [REST/MCP boundaries](automation-security.md) for its
specific review map and [hosting](hosting.md) for the isolated container rehearsal.
Publication checks must reject missing grants, absent/false confirmation, stale
saved targets and domain readiness/private-media blockers, while leaving unrelated
drafts and dependencies unchanged. Existing credentials must retain their grants.
Calendar audience and notification effects need domain checks; no real participant
delivery is necessary for these regressions.

For OAuth renewal, distinguish five-minute access expiry from a real need to sign
in again. Cover remembered same/narrower consent, recent authentication for first
or expanded grants, opting out of renewal, current-session revocation and the
ten-second same-client/scope/resource refresh retry grace. Grace must not widen
scope or accept a different resource. Refresh may omit only the fixed MCP resource;
initial authorization/code exchange must still name it explicitly.

For identity-protected sensitive actions, authenticate and verify the actor before
charging their attempt quota. Key that quota with trusted identity, never a
browser-supplied user ID or a shared installation bucket that unrelated callers
can exhaust. Test anonymous rejection, another actor's exhausted quota, and the
owner's independent allowance. Keep existing claim and domain authorization checks.
Public intake and authentication also need bounded requests and deployment-level
abuse controls; an application quota does not establish resistance to flooding.

## Run the checks

Scan all locked dependencies, including development tools:

```sh
node scripts/pnpm.mjs audit --audit-level low
node scripts/pnpm.mjs api:check
node scripts/pnpm.mjs test:critical tests/critical/owner-endpoint-boundary.test.ts tests/critical/adversarial-content.test.ts
```

Run the smallest affected test while fixing a finding. Retain a failing
reproduction, then verify the fix without removing or weakening the assertion.
Use real PostgreSQL when persistence, scope, races or transactions matter. Route
fixtures can test ordering, but cannot establish successful real authentication.

For a completed application slice, run once:

```sh
node scripts/pnpm.mjs verify
node scripts/pnpm.mjs doctor
```

`verify` includes strict types, lint, the API/MCP contract, critical tests, a
production build and both principal browser journeys. Preserve failure details
and rerun affected checks after a fix. Distinguish the initial failure from the
subsequent result in the assessment record.

Network attack fixtures inject DNS or transport responses. Browser exfiltration
probes use an intercepted `.invalid` hostname and synthetic markers, so a regression
cannot send private data to an external receiver. B01 signs in through real local
OTP delivery, then issues real session-bound API keys; it does not fabricate a
successful external Google or AI-provider callback.

## Inspect secrets and build artifacts

Check tracked and untracked candidate paths for environment files, private keys,
database dumps and local reports. Use `git ls-files --cached --others --exclude-standard`
to identify release candidates without traversing ignored private files. Include
historical Git objects when assessing information already committed. Scan
credential signatures without printing matched values, then triage
each candidate: synthetic negative fixtures can resemble credentials. Examine
logging/error sinks and provider adapters; pattern matching alone cannot establish
whether a value reaches a public response.

After the production build, check browser assets under `.next/static` for exact
configured server-secret values without logging those values. This complements
source review; it does not find every unknown or transformed secret. Keep scans,
reproductions and sensitive evidence in ignored local storage. Explicitly report
whether the scan covered the current tree, Git history, dependencies or images.

## Record the limits

A clean dependency audit means no known advisory was returned at that time.
Static searches are not complete taint analysis. Passing regressions only cover
their tested paths and do not prove absence of authorization or injection defects.

Separate local evidence from public-host TLS, reverse-proxy/IP trust, edge rate
limits, monitoring, real-provider callbacks and external AI-client acceptance.
Container/OS vulnerability scanning, load tests and an independent penetration test
are separate activities. Do not imply they occurred from an application test pass.

The parent application's CSP currently permits inline scripts. Sanitization and
the custom-code sandbox remain important boundaries; a nonce-based CSP would add
defense in depth but is not proof of an existing XSS exploit. AI source text remains
untrusted, even after sanitization. Grant minimal read/draft scopes and approved
source origins; add publication grants only for intended requests and keep client
approval enabled. The server cannot prove a human request from `confirmed: true`.
Remember that a client can receive
the private data its connection is explicitly allowed to read.

Record commit, changed files, severity/impact, reproduction, fix, exact commands,
outcomes and untested surfaces in a private local report or the relevant security
advisory. Follow the disclosure process in [SECURITY.md](../../SECURITY.md).
Public documentation should retain the method and regression map, not machine
credentials or a transcript of an assessment.
