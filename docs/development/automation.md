# Extending REST and MCP together

The implementation has four phases: shared authenticated operations; reference
extraction and atomic imports; connection/review UX and prompts; contract/security
verification. Automation creates private drafts with human publication.

`src/integrations/automation/catalogue.ts` is the single registry. Each operation
declares a stable name, method/path, scope, description, validated request example
and Zod input/output. REST dispatch,
MCP tools and OpenAPI read it. Domain services remain responsible for validation,
scope, version checks, transactions, audits and publication. Never implement a
second CMS or bypass a service to mutate content in an adapter.

## When any feature changes

1. Review its entry in `automation-coverage.json`. Every feature/integration needs
   supported operations or a reason its workflows remain manual.
2. Update the shared operation/schema for safe automation. Review scopes, narrow
   response projections, descriptions, examples and prompts. Responses validate
   against closed schemas before serialization; unexpected fields fail closed.
   Native CMS block fields appear
   in page-save schemas automatically; executable CustomCode remains unavailable.
   Never expose participant fields through a broader service DTO.
3. Add focused authorization, publication, concurrency or network regressions.
   Extend B01/B02 when a user workflow changes.
4. Update the guide and coverage policy. Breaking v1 changes need a versioned
   compatibility decision; additive changes update `contractVersion`.
5. Review the final change, run `node scripts/pnpm.mjs api:record`, inspect its diff,
   then run `node scripts/pnpm.mjs api:check` and the affected checks.

`api:check` fingerprints features, integrations, core, infrastructure, composition,
API routes and database schemas. Changes without a reviewed receipt fail `check`,
`verify` and GitHub's API/MCP workflow. Duplicate tools/routes, uncovered directories
and unknown operation references also fail. REST/MCP inputs share definitions and
cannot independently drift. Invalid request examples also fail the check. Response
schemas power both the tester and MCP structured output. The receipt stores hashes instead of duplicating a
large generated specification.

Recording a hash acknowledges review; it does not prove semantic safety. Reviewers
must inspect operations, prompts, tests and manual boundaries. A feature may stay
manual when exposing it would disclose data or publish effects beyond the grant.

## Preserve these boundaries

- Better Auth owns keys and sessions. `enableSessionForAPIKeys` stays false. Raw
  plugin management routes remain inaccessible over HTTP.
- Creating keys requires current integration-management access and recent sign-in.
  Executing operations rechecks the real parent session and current Google policy.
- Every tool is also a registered REST operation. MCP annotations are hints, not
  permissions. Unknown operations, extra fields and missing scopes fail closed.
- Imports use shared CMS creation/draft services in one PostgreSQL transaction.
  Organization locking serializes retries; immutable receipts bind request ID,
  input hash and creator. Source HTML is not retained.
- Source reads use the pinned-IP adapter with origin grants, IP checks, robots,
  byte limits and deadlines. Never replace it with generic URL fetching.
- Stored/fetched content is untrusted data. Prompts cannot grant access, publish
  content or execute code.
- The stdio bridge is a client for the same remote API, never a local-admin bypass,
  database connection or OAuth authorization server.

See [AI & API](../guides/ai-and-api.md) for setup, endpoints and current limits.
The [security review map](automation-security.md) records trust boundaries and
regressions. The [API reference](../guides/api-reference.md) and
[client guide](../guides/mcp-clients.md) describe the authenticated tester.
