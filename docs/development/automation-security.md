# REST and MCP security boundaries

This is an implementation review and regression map, not an independent penetration
test or a guarantee against every attack. REST and MCP share the operation catalogue,
server-side authorization and domain services. New operations require review here
and in `automation-coverage.json` before updating the contract receipt.

## Reviewed trust boundaries

| Boundary            | Enforcement and regression                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Availability        | REST and MCP default to disabled; independent current server gates reject requests using existing credentials too; administrative changes require current permission, recent sign-in and expected version                                               |
| Connection issuance | Current integration-management permission, recent sign-in, fixed scopes, expiry and origin limits; raw Better Auth management and dynamic-registration routes blocked                                                                                   |
| OAuth               | Official Better Auth provider; exact registered callback/resource, mandatory S256 PKCE, signed consent, short-lived hashed tokens, rotating refresh, current consent checks and revocation; no remote client-metadata fetch or Google-token passthrough |
| Identity            | Library-managed API key or OAuth token bound to a genuine session; reload identity, membership, Google policy and current capabilities on requests                                                                                                      |
| Browser/host        | Canonical Host/Origin checks, cross-site denial, same-origin admin mutations; cookies alone do not authenticate automation                                                                                                                              |
| Resource authority  | Shared domain services validate organization, event access, feature state and record ownership; input IDs never grant access                                                                                                                            |
| Writes              | Native private drafts, private images and typed review proposals; no publishing, visibility changes, operational settings application, notifications or participant operations; optimistic revisions and atomic retry receipts                          |
| Source fetching     | Explicit origin grants, HTTPS, all DNS answers checked, public IPv4 pinning, no redirects/proxies/cookies, robots policy, byte/time limits, no script execution                                                                                         |
| Image inputs        | Scoped PNG/JPEG/WebP uploads; bounded bytes/pixels, real decoding, one frame, reencoding and metadata stripping; private storage, actor-bound retries and current authorization after processing                                                        |
| Image outputs       | Separate private-pixel scope; bounded metadata-free inspection; saved-page previews use exact revisions, isolated local rendering, no scripts/network or browser credentials, and reauthorization before releasing pixels                               |
| Event preparation   | Existing event services and current scope; stable preparation IDs, private drafts, projected readiness and immutable operational proposals requiring administration review; no copied participants or provider state                                    |
| Responses           | Closed schemas validated before REST/MCP output; explicit form/event projections; no unexpected service fields or internal exception details                                                                                                            |
| MCP protocol        | Official SDK, stateless POSTs, one JSON-RPC message per bounded request, validated inputs and output schemas; authorization is separate from annotations                                                                                                |
| Tester              | Same-instance endpoints, bearer credentials in page memory, no cookie authority, redirects refused, text-only rendering, no external documentation scripts                                                                                              |
| Evolution           | Shared schemas/examples, input and output parity, resolved OpenAPI references, coverage and source fingerprints in `api:check`                                                                                                                          |

## Findings addressed

- MCP resource reads previously allowed unexpected dependency exceptions to reach
  the SDK, whose error response could contain internal exception text. The handler
  now translates those failures to a generic protocol error. The focused regression
  injects a synthetic sensitive exception and verifies neither response nor logs
  contains it.
- Output DTOs previously relied on each adapter to avoid future service-field
  additions. Every registered operation now validates a closed response schema
  before serialization. Unexpected fields fail closed with a generic server error.
  This also makes REST documentation and MCP structured output enforceable.
- Feature discovery now projects only feature key, enabled state and version,
  without returning internal database row metadata. Capability catalogues are
  compact; full schemas remain available through OpenAPI and tool discovery.
- MCP draft updates now carry a destructive hint because they replace draft
  content. Annotations never bypass the service's revision checks or permissions.

## Evidence to maintain

`tests/critical/automation-boundary.test.ts` covers source/origin/robots restrictions.
`automation-contract.test.ts` covers output privacy, generic MCP failures, valid
examples/references and tester transport restrictions. Import/concurrency cases
run in `automation-import-cases.ts` against PostgreSQL.
`adversarial-content.test.ts` rejects forged identity/prototype fields across
every registered input and tests private/mixed DNS answers in all configurable
outbound adapters. B01 also attempts unregistered publication, member, credential
and prototype-named tools and checks their safe denial responses.

`oauth-provider.test.ts` uses real Better Auth OTP/session and token APIs against
PostgreSQL for confidential/public PKCE clients, resource binding, token hashing,
refresh/replay handling, current Google/membership/session policy, revocation and
disabled-MCP refusal. `oauth-policy.test.ts` covers strict callbacks, metadata and
pending authorization bounds. `automation-media-boundary.test.ts`, the PostgreSQL
media cases and `automation-preview.test.ts` cover image limits, private bytes,
retry boundaries and renderer isolation. Event cases cover scoped proposals and
event-owned private media. These are focused regressions, not exhaustive proof.

B01 uses a real Better Auth OTP session, issued keys and a loopback OAuth client.
Its automation helpers
exercise REST/MCP/stdio, current-session and capability revocation, scope denial,
Google-only policy, malformed/oversized requests, custom-code rejection, private
draft writes, output projections, separate enable/disable controls, private images,
page previews, event preparation/proposal review, and the desktop/phone tester and
OAuth consent screen.
Fixture changes stay in the dedicated browser database. No fabricated live identity
or external AI-provider response is accepted as evidence.

Before release, run `node scripts/pnpm.mjs audit --audit-level low`, the
affected regressions and full `verify` once for the completed slice. A dependency
audit reports known advisories at that time; it is not a source audit or proof of
absence of vulnerabilities. Machine-specific results belong in `.local/STATUS.md`.
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
