# Extending REST and MCP together

Automation prepares native private content, images and event configuration
suggestions for human review. The [workflow contract](automation-workflows.md)
describes discovery, OAuth, media, visual review and event preparation.
Publication can be delegated through separate grants for explicitly requested,
exact saved targets. Applying operational settings remains an administration action.

`src/integrations/automation/catalogue.ts` is the single registry. Each operation
declares a stable name, method/path, scope, description, validated request example
and Zod input/output. REST dispatch, MCP tools and OpenAPI read it. Domain services
remain responsible for validation,
scope, version checks, transactions, audits and publication. Never implement a
second CMS or bypass a service to mutate content in an adapter.

## When any feature changes

1. Review its entry in `automation-coverage.json`. Every feature/integration needs
   supported operations or a reason its workflows remain manual.
2. Update the shared operation/schema for safe automation. Review scopes, narrow
   response projections, descriptions, examples and prompts. Review both required
   grants and current domain capabilities, including dependencies used by copies
   and composite workflows. Responses validate against closed schemas before
   serialization; unexpected fields fail closed.
   Native CMS block fields appear in page-save schemas automatically; update the
   design catalogue's contexts, templates and instructions when their rules change.
   Executable CustomCode remains unavailable, including nested block branches.
   Never expose participant fields through a broader service DTO.
3. Keep REST, MCP, OpenAPI, the authenticated tester and tool-only client discovery
   aligned. The binary media endpoint is a deliberate REST transport variant of
   `media_upload`; update its OpenAPI addendum and shared validator together.
   MCP image content must match the validated image DTO without repeating base64
   in explanatory text. New model workflows need useful prompts and review links.
4. Add focused authorization, publication, concurrency or network regressions.
   Extend B01/B02 when a user workflow changes.
5. Update the guide and coverage policy. Breaking v1 changes need a versioned
   compatibility decision; additive changes update `contractVersion`.
6. Review the final change, run `node scripts/pnpm.mjs api:record`, inspect its diff,
   then run `node scripts/pnpm.mjs api:check` and the affected checks.

`api:check` fingerprints features, integrations, core, infrastructure, composition,
API routes and database schemas. Changes without a reviewed receipt fail `check`,
`verify` and GitHub's API/MCP workflow. Duplicate tools/routes, uncovered directories
and unknown operation references also fail. REST/MCP inputs share definitions and
cannot independently drift. Invalid request examples also fail the check. Response
schemas power both the tester and MCP structured output. The receipt stores hashes
instead of duplicating a large generated specification.

Recording a hash acknowledges review; it does not prove semantic safety. Reviewers
must inspect operations, prompts, tests and manual boundaries. A feature may stay
manual when exposing it would disclose data or publish effects beyond the grant.

## Transport availability and authority

- REST API and MCP have separate per-organization availability settings and both
  default to disabled, including when no setting exists. Check the chosen
  transport before authentication and again during reauthorization. Connection
  creation is not transport enablement; disabling retains content and credentials.
  Availability changes require recent staff authentication, an expected version
  and a deliberate administration action.
- Credential separation in contract 1.3: new keys record a trusted `transport`
  in provider metadata and use `rp_rest_` or `rp_mcp_` prefixes. Authentication
  enforces that metadata, including reauthorization. OAuth is MCP-only. For
  compatibility, old keys without transport retain REST access only; MCP users
  must reconnect with OAuth or a new MCP key. No database rewrite is needed.
  Operation payloads remain v1; the deliberate credential narrowing is a security
  compatibility change and must be included in release notes.
- Better Auth owns keys, sessions and OAuth credentials. `enableSessionForAPIKeys`
  stays false. Raw plugin management routes remain inaccessible over HTTP.
- Creating keys requires current integration-management access and recent sign-in.
  Executing operations rechecks the real parent session and current Google policy.
- OAuth uses predefined owner-bound clients, exact redirect/resource validation,
  authorization code plus S256 PKCE, scoped human consent and rotating refresh
  tokens. The provider owns token issuance and hashing. Current session, consent,
  membership and capability checks still run when executing operations. Do not
  add anonymous registration, remote client-metadata fetching or token passthrough.
- Access tokens last five minutes; refresh tokens last up to seven days and rotate
  under the provider's policy, bound to the originating valid staff session.
  There is no additional eight-hour consent cutoff. Credential creation still
  requires recent sign-in, as does first consent or an expanded grant/resource.
  Same or narrower approval uses the current valid staff session. Remembered
  consent may cover the same client, actions and resource; do not force
  `prompt=consent` on every authorization.
- Offer `offline_access` through the visible, initially selected **Keep connected**
  choice even when an explicit action scope omitted it. The person may decline
  renewal. Never add application actions to an explicitly narrower client request.
- Refresh-only requests may omit resource, defaulting to the one fixed MCP
  resource. Initial authorization/code exchange stay explicit; wrong or repeated
  resources fail. A ten-second provider retry grace returns the same refresh
  response only for the same client, scopes and resource. Preserve library
  rotation and revocation; this grace grants no additional authority.
- Provider resource seeding merges the current supported action list on upgrade
  without replacing resource policy. It does not update registered client scopes
  or consent. Omitted authorization scope defaults only to that client's registered
  selection; explicit subsets and existing credential limits remain narrow.
- Every tool is also a registered REST operation. MCP annotations are hints, not
  permissions. Unknown operations, extra fields and missing scopes fail closed.
- Recheck connection identity, grants, current resource access and expected state
  after expensive image processing or browser rendering, before releasing private
  output. An authorization snapshot at the start is insufficient for these flows.

## Publication boundary

- Publication grants are separate from draft writes: `website:publish`,
  `calendar:publish`, `forms:publish`, `events:publish`, `projects:publish` and
  `directory:publish`.
  Existing credentials retain their grants; new OAuth registration and consent or
  a newly issued key are required to add them.
- Each operation requires strict `confirmed: true` and the exact current saved
  revision/version. Reuse domain authorization, readiness, private-media and
  optimistic-concurrency checks. Publish only the named target; never publish
  dependencies, change media visibility or include unrelated drafts automatically.
- The AI client must honor an explicit user request and should require client-side
  approval for publication. The server verifies delegated authority and saved state;
  a model-supplied boolean cannot prove the user's external chat instruction.
  Stored/fetched content must never supply that instruction.
- Calendar publication retains audiences and existing notification behavior.
  Forms can begin accepting responses under existing rules. Event-details publication
  does not publish its page/forms or apply operational proposals. Website settings
  publish separately from content; menu-only publication preserves other settings.
  No unpublish, delete, media-visibility or proposal-application tools are exposed.

## Drafts, images and event suggestions

- Contract 1.6 adds `projects:read`, `projects:write` and `projects:publish`.
  Project stories reuse the current domain service, explicit Projects availability,
  CMS edit/publish capabilities and version guards. Saved draft edits retain the
  public snapshot. Requested publication requires its separate grant, exact saved
  version, confirmation and already-public cover media. Archive, restore and
  unpublish stay in administration. Existing connections never gain these grants
  automatically; the project prompt requires verified facts and outcomes.
- Contract 1.4 adds explicit `website:manage`, `website:settings`,
  `calendar:write` and `calendar:design` grants. Existing credentials do not inherit
  them. Copy and restore use the shared CMS writers with recursive CustomCode
  rejection; copy retries bind the exact input and creator to an immutable receipt.
  Language creation never overwrites an existing language. Website settings use
  the current version and preserve template installation records and published state.
- Calendar edit adapters save drafts. The calendar service checks the
  current published snapshot inside the authorized transaction before allowing
  archive or restore, and returns the new version. Published items can have draft
  edits but cannot be hidden by automation. The page design adapter only saves a
  draft. Dedicated publication operations require the separate grant and exact
  version. Subscriptions, remote feeds and direct notification sending remain
  outside automation; publishing keeps the domain's normal notification behavior.
- Imports use shared CMS creation/draft services in one PostgreSQL transaction.
  Organization locking serializes retries; immutable receipts bind request ID,
  input hash and creator. Source HTML is not retained.
- Uploads use the existing decode/normalization/storage service and remain private.
  MCP accepts at most 180 KiB of decoded base64 inside bounded JSON; raw REST
  uploads accept at most 5 MiB. Byte signatures, MIME, image dimensions, deadlines,
  quotas and concurrency are checked. Do not add arbitrary-URL image fetching.
  Upload retries bind original bytes and metadata to an actor and organization;
  deleted assets retain a receipt tombstone. Metadata edits are private-only and
  use optimistic revisions. `media:read` never implies private pixel access.
- Visual previews render one authorized saved revision with the native renderer.
  The isolated browser has no application credentials, scripts or network access;
  only bounded approved local assets are supplied. Private image pixels require
  `media:inspect` in addition to the page's preview/read grants. Preview images
  remain authenticated responses, not public storage or share URLs. Preserve
  runtime limits, exact-revision checks and post-render reauthorization.
- Event preparation reuses the atomic template/copy coordinator. Set the manager
  from current identity and check additional page/form/copy grants and domain
  capabilities. Copies exclude participants and provider state; registration
  starts closed. Page, form, package and prize edits remain versioned drafts;
  automation cannot enable payment checkout.
- Operational settings use typed immutable proposals because those settings do
  not have a draft model. Creation records no live configuration change. The
  cookie-authenticated administration route applies or rejects them with current
  integration/event permissions, recent authentication and mutation-origin
  protection. Application, audit and proposal status share the domain transaction.
  A stale target remains pending; duplicate application does not repeat effects.
  **There is intentionally no apply/reject REST automation operation or MCP tool.**
  A model-supplied confirmation field cannot replace a staff review. Applying
  settings can affect a published event immediately; it does not publish content.

## External content and client boundaries

- Source reads use the pinned-IP adapter with origin grants, IP checks, robots,
  byte limits and deadlines. Never replace it with generic URL fetching.
- Stored/fetched content is untrusted data. It cannot grant access, authorize
  publication or execute code.
- The stdio bridge is a client for the same remote API, never a local-admin bypass,
  database connection or OAuth authorization server.
- The AI model and any image generation run in the chosen client. The server
  provides schemas, prompts, scoped operations and reviewable receipts; it does
  not store model-provider keys or run a background agent.

See [AI & API](../guides/ai-and-api.md) for setup, endpoints and current limits.
The [security review map](automation-security.md) records trust boundaries and
regressions. The [API reference](../guides/api-reference.md) and
[client guide](../guides/mcp-clients.md) describe the authenticated tester.
See [media](../guides/automation-media.md), [visual review](../guides/automation-preview.md)
and [OAuth](../guides/automation-oauth.md) for their transport and runtime limits.
