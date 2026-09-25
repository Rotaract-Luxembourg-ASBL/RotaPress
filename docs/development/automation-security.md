# REST and MCP security boundaries

This is an implementation review and regression map, not an independent penetration
test or a guarantee against every attack. REST and MCP share the operation catalogue,
server-side authorization and domain services. New operations require review here
and in `automation-coverage.json` before updating the contract receipt.

## Reviewed trust boundaries

| Boundary | Enforcement and regression |
| --- | --- |
| Connection issuance | Current integration-management permission, recent sign-in, fixed scopes, expiry and origin limits; raw Better Auth API-key routes blocked |
| Identity | Library-hashed API key bound to a genuine session; reload identity, membership, Google policy and current capabilities on requests |
| Browser/host | Canonical Host/Origin checks, cross-site denial, same-origin admin mutations; cookies alone do not authenticate automation |
| Resource authority | Shared domain services validate organization, event access, feature state and record ownership; input IDs never grant access |
| Writes | Native private drafts only; no publishing, deletion, notifications, settings or participant operations; optimistic revisions and atomic import receipts |
| Source fetching | Explicit origin grants, HTTPS, all DNS answers checked, public IPv4 pinning, no redirects/proxies/cookies, robots policy, byte/time limits, no script execution |
| Responses | Closed schemas validated before REST/MCP output; explicit form/event projections; no unexpected service fields or internal exception details |
| MCP protocol | Official SDK, stateless POSTs, one JSON-RPC message per bounded request, validated inputs and output schemas; authorization is separate from annotations |
| Tester | Same-instance endpoints, bearer credentials in page memory, no cookie authority, redirects refused, text-only rendering, no external documentation scripts |
| Evolution | Shared schemas/examples, input and output parity, resolved OpenAPI references, coverage and source fingerprints in `api:check` |

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

B01 uses a real Better Auth OTP session and issued keys. Its automation helpers
exercise REST/MCP/stdio, current-session and capability revocation, scope denial,
Google-only policy, malformed/oversized requests, custom-code rejection, private
draft writes, output projections, and the desktop/phone documentation tester.
Fixture changes stay in the dedicated browser database. No fabricated live identity
or external AI-provider response is accepted as evidence.

Before release, run `node scripts/pnpm.mjs audit --prod --audit-level high`, the
affected regressions and full `verify` once for the completed slice. A dependency
audit reports known advisories at that time; it is not a source audit or proof of
absence of vulnerabilities. Machine-specific results belong in `.local/STATUS.md`.

## Remaining limits

Public-host reverse-proxy configuration, live source fetching, provider-client
acceptance and operational abuse monitoring need real environment verification.
The network adapter deliberately does not support authenticated, IPv6-only or
JavaScript-rendered reference sites. Source attribution is not proof of reuse rights.
Prompt injection is mitigated with limited tools and data boundaries, not by treating
sanitized source text as trustworthy instructions.

The server uses first-party bearer credentials. OAuth discovery, consent/refresh,
permanent service accounts and unattended publication are outside this contract.
Current collection pagination adapts club-sized service lists rather than database
cursors. See [client limits](../guides/mcp-clients.md#current-boundaries).
