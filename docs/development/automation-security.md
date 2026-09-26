# REST and MCP security boundaries

REST and MCP share the operation catalogue, server-side authorization and domain
services. This document maps their trust boundaries to required controls and
regressions. Review new operations against these boundaries and
`automation-coverage.json` before updating the contract receipt. The map does not
replace an independent security assessment.

## Trust boundaries

| Boundary            | Enforcement and regression                                                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Availability        | REST and MCP default to disabled; independent current server gates reject requests using existing credentials too; administrative changes require current permission, recent sign-in and expected version                                                                                    |
| Connection issuance | Current integration-management permission, recent sign-in, fixed scopes, expiry and origin limits; raw Better Auth management and dynamic-registration routes blocked                                                                                                                        |
| OAuth               | Official Better Auth provider; exact registered callback/resource, mandatory S256 PKCE, signed consent, short-lived hashed tokens, rotating refresh, current consent checks and revocation; no remote client-metadata fetch or Google-token passthrough                                      |
| Credential audience | Provider metadata binds each key to REST or MCP; OAuth is MCP-only. Wrong-integration credentials fail before domain operations; legacy keys retain REST only. C14 and B01 cover issuance, filtering and cross-use rejection.                                                                |
| Identity            | Library-managed API key or OAuth token bound to a genuine session; reload identity, membership, Google policy and current capabilities on requests                                                                                                                                           |
| Browser/host        | Canonical Host/Origin checks, cross-site API denial and same-origin admin mutations. Only top-level GET navigation to OAuth authorization and its signed sign-in handoff may enter cross-site; route validation and human consent still apply. Cookies alone do not authenticate automation. |
| Resource authority  | Shared domain services validate organization, event access, feature state and record ownership; input IDs never grant access                                                                                                                                                                 |
| Draft writes        | Native private drafts, private images and typed review proposals; no visibility changes, operational settings application, direct notification sending or participant operations; optimistic revisions and atomic retry receipts                                                             |
| Publication         | Separate publication grant, current identity/domain capability, strict `confirmed: true`, exact current saved revision/version and existing readiness/private-media checks; named target only, no automatic dependency publication; calendar audiences and notification rules retained       |
| Source fetching     | Explicit origin grants, HTTPS, all DNS answers checked, public IPv4 pinning, no redirects/proxies/cookies, robots policy, byte/time limits, no script execution                                                                                                                              |
| Image inputs        | Scoped PNG/JPEG/WebP uploads; bounded bytes/pixels, real decoding, one frame, reencoding and metadata stripping; private storage, actor-bound retries and current authorization after processing                                                                                             |
| Image outputs       | Separate private-pixel scope; bounded metadata-free inspection; saved-page previews use exact revisions, isolated local rendering, no scripts/network or browser credentials, and reauthorization before releasing pixels                                                                    |
| Event preparation   | Existing event services and current scope; stable preparation IDs, private drafts, projected readiness and immutable operational proposals requiring administration review; no copied participants or provider state                                                                         |
| Responses           | Closed schemas validated before REST/MCP output; explicit form/event projections; no unexpected service fields or internal exception details                                                                                                                                                 |
| MCP protocol        | Official SDK, stateless POSTs, one JSON-RPC message per bounded request, validated inputs and output schemas; authorization is separate from annotations                                                                                                                                     |
| Tester              | Same-instance endpoints, bearer credentials in page memory, no cookie authority, redirects refused, text-only rendering, no external documentation scripts                                                                                                                                   |
| Evolution           | Shared schemas/examples, input and output parity, resolved OpenAPI references, coverage and source fingerprints in `api:check`                                                                                                                                                               |

## Response and discovery invariants

- Translate unexpected dependency exceptions into generic protocol errors before
  they reach the MCP SDK. The regression injects a synthetic sensitive exception
  and verifies that neither the response nor logs contain it.
- Validate every operation's closed output schema before serialization. A newly
  added domain-service field must not silently become public API output. Unexpected
  fields fail closed; REST documentation and MCP structured output use that schema.
- Feature discovery returns only feature key, enabled state and version. It omits
  internal database row metadata. Capability summaries stay compact, with full
  schemas available through OpenAPI and tool discovery.
- Mark draft replacements with the MCP destructive hint. Annotations describe
  behavior to clients; service permissions and revision checks enforce authority.
- Publication tools must be treated as consequential writes. The client must act
  on an explicit user request and should require approval before calling them.
  The server enforces the delegated scope and exact saved state; a confirmation
  boolean supplied by a model is not evidence of a human instruction in another app.
- Renewal changes must preserve authority: five-minute access tokens, rotating
  refresh tokens lasting up to seven days, and current originating-session,
  membership, consent, resource and revocation checks. No separate eight-hour
  consent age cutoff applies. Credential creation, first consent and expanded
  grants/resource require recent sign-in; repeated same or narrower consent uses
  a current valid owned session. Remembered consent covers unchanged
  actions/resource without forcing another prompt.
  Serialize consent changes and re-read the saved user/client grant before
  applying the recent-sign-in exemption, so another tab's narrowing is respected.
- The visible **Keep connected** choice defaults to selected and may be declined.
  Offering `offline_access` must never add application actions to a narrow request.
  AI-app reconnect prompts and publication-tool approval are not controlled by
  the server's token renewal policy.
- A ten-second provider replay grace is restricted to the same refresh client,
  scopes and resource. It replays the issued response, not a broader grant.
  Refresh-only omitted resource defaults to the fixed MCP endpoint; explicit
  wrong/repeated resources and omitted resource at initial authorization/code
  exchange remain rejected. Token rotation, revocation and current authority
  are still enforced during grace.

## Regression coverage

`tests/critical/automation-boundary.test.ts` covers source/origin/robots restrictions.
`automation-contract.test.ts` covers output privacy, generic MCP failures, valid
examples/references and tester transport restrictions. Import/concurrency cases
run in `automation-import-cases.ts` against PostgreSQL.
`adversarial-content.test.ts` rejects forged identity/prototype fields across
every registered input and tests private/mixed DNS answers in all configurable
outbound adapters. B01 also attempts unregistered member, credential
and prototype-named tools and checks their safe denial responses.

`oauth-provider.test.ts` uses real Better Auth OTP/session and token APIs against
PostgreSQL for confidential/public PKCE clients, resource binding, token hashing,
refresh/replay handling, current Google/membership/session policy, revocation and
disabled-MCP refusal. `oauth-policy.test.ts` covers strict callbacks, metadata and
pending authorization bounds. `automation-media-boundary.test.ts`, the PostgreSQL
media cases and `automation-preview.test.ts` cover image limits, private bytes,
retry boundaries and renderer isolation. Event cases cover scoped proposals and
event-owned private media. These are focused regressions, not exhaustive proof.

The provider suite's `oauth-renewal-cases.ts` covers remembered consent beyond
eight hours, a valid older staff session, new-permission reauthentication and a
concurrent narrowing between consent reads. B01 expires issued access, renews it,
retries renewal and reconnects using saved consent. It also checks sign-in recovery
when a consent page remains open past the recent-authentication window.

`automation-website-cases.ts` checks copy retry receipts, exact revision/language
access, nested CustomCode rejection, current membership and private site settings.
`automation-calendar-cases.ts` checks stale versions, owning-calendar IDs, private
archive/restore and unchanged published snapshots. OAuth cases verify omitted
scope uses registered defaults, explicit subsets stay narrow, malformed scope is
rejected and existing registrations never gain new grants. B01 exercises the new
calendar operations through a selected OAuth grant and the actual MCP endpoint.

`automation-project-cases.ts` checks project read/write/publication scope separation,
exact saved versions and confirmation, unchanged public stories while drafts are
edited, named-target isolation, revoked membership and disabled Projects. Domain
project cases cover private cover media and publication readiness with PostgreSQL.

Publication regressions must cover missing grants, absent/false confirmation,
stale versions, revoked identity, private-media/readiness blockers, named-target
isolation and unchanged dependencies. Check calendar audiences/notifications and
form acceptance using domain fixtures, not real participant delivery. Existing
credentials must never acquire publication scopes merely from a resource upgrade.

B01 uses a real Better Auth OTP session, issued keys and a loopback OAuth client.
Its automation helpers exercise REST/MCP/stdio, current-session and capability revocation, scope denial,
Google-only policy, malformed/oversized requests, custom-code rejection, private
draft writes, output projections, separate enable/disable controls, private images,
page previews, event preparation/proposal review, and the desktop/phone tester and
OAuth consent screen. Fixture changes stay in the dedicated browser database;
external Google and AI-provider callbacks require separate integration checks.

`browser-origin.test.ts` confines the OAuth navigation exception to the two exact
GET routes and rejects cross-site fetches, frames, preflight, token calls and other
API routes. B01 enters authorization by clicking a link on an intercepted synthetic
external-origin page and verifies both signed-out sign-in handoff and signed-in
consent before the token flow.

Before release, run `node scripts/pnpm.mjs audit --audit-level low`, the
affected regressions and full `verify` once for the completed slice. A dependency
audit reports known advisories at that time; it is not a source audit or proof of
absence of vulnerabilities. Keep environment-specific results in private local
reports or the relevant pull request, without credentials or participant data.
The [application security testing guide](security-testing.md) covers the wider
authentication, content, media, provider and hosting boundaries.

## Remaining limits

Public-host reverse-proxy configuration, live source fetching, provider-client
acceptance and operational abuse monitoring need real environment verification.
The network adapter deliberately does not support authenticated, IPv6-only or
JavaScript-rendered reference sites. Source attribution is not proof of reuse rights.
Prompt injection is mitigated with limited tools and data boundaries, not by treating
sanitized source text as trustworthy instructions.

The server accepts scoped first-party API keys and Better Auth OAuth tokens.
OAuth discovery, registered clients, consent, PKCE, refresh and revocation are
implemented; external client acceptance remains a separate hosted check. Anonymous
dynamic registration, remote client metadata, permanent service accounts and
unattended publication are outside this contract.
Current collection pagination adapts club-sized service lists rather than database
cursors. See [client limits](../guides/mcp-clients.md#current-boundaries).
