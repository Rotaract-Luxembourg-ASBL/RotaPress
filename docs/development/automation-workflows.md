# AI workflow architecture

An assistant can discover the native content structure, prepare website or event
drafts, upload private images and inspect rendered previews. Staff review the
result in RotaPress before publishing or applying operational settings. The model
runs in the chosen client; RotaPress supplies scoped tools and does not store
model-provider keys or run a background agent service.

## Components and responsibilities

| Component               | Responsibility                                                                             | Primary implementation                          |
| ----------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Operation catalogue     | Shared REST/MCP routes, scopes, validated inputs, closed outputs and examples              | `src/integrations/automation/catalogue.ts`      |
| Native design discovery | CMS block schemas, supported contexts, templates and event layouts                         | `design_operations.ts`, `event_operations.ts`   |
| Connection access       | Better Auth credentials, current session and membership, scopes and transport availability | `AutomationAccess.ts`, `oauth/`                 |
| Event preparation       | Reviewed presets/copies, linked page and form drafts, stable retries                       | `event_operations.ts`, `EventTemplateService`   |
| Media operations        | Validated private uploads, bounded pixel inspection and private metadata edits             | `media_operations.ts`, `MediaService`           |
| Visual review           | Exact saved revisions rendered with native components in an isolated browser               | `WebsitePreviewService.ts`, `preview_*.ts`      |
| Settings proposals      | Typed immutable suggestions applied only through staff administration                      | `AutomationProposalService.ts`                  |
| Client prompts          | Instructions that compose existing tools into page, event and review workflows             | `workflow_prompts.ts`, `workflow_operations.ts` |

Unqualified file names are under `src/integrations/automation`; the event and media
services remain in their owning feature modules. Adapters delegate to those
services rather than reproducing their authorization or persistence logic. See
[the extension contract](automation.md) when adding or changing an operation.

Clients compose these operations into a workflow. Responses supply saved versions,
readiness blockers and authenticated review links so the client can continue from
the resulting state. A completed tool call does not establish that an external
provider, notification, payment or public event is operational.

## Authority and publication

The server grants capabilities, not the prompt. Reload current identity,
membership, Google session policy, organization and object scope. OAuth consent
and manually issued connection keys delegate a real staff session; they cannot
create membership, change staff permissions or authorize actions after revocation.

Separate metadata from image pixels, read from draft write, and draft preparation
from operational activation. Extra scopes require explicit consent from authorized
staff; discovery describes only the connection's granted operations. No image
becomes public merely because AI selected it. No page, form or event becomes
public merely because a tool finished successfully.

Keep consequential settings as typed review proposals where the underlying
feature has no draft model. Only the authenticated administration workflow may
apply a proposal, after current authorization and expected-state checks. A model's
`confirmed: true`, a prompt, or an MCP annotation is never human approval. Current
publication controls remain the authority for publishing content.

Participant identities, responses, member approvals, credentials, payments and
draw decisions remain outside content preparation. Native paid checkout, guest
invitation delivery and real paid draws are not implemented merely by adding MCP.
Use the existing event/provider workspace for those supported operational actions;
do not fabricate their completion in a tool receipt.

## Data flow

```mermaid
flowchart LR
  Client[Chosen AI client] --> Auth[Better Auth and current club scope]
  Auth --> Registry[Shared REST and MCP operations]
  Registry --> Services[Existing domain services]
  Services --> Drafts[Private content and media]
  Drafts --> Preview[Isolated native preview]
  Preview --> Client
  Drafts --> Review[Staff review in RotaPress]
  Registry --> Proposals[Typed configuration proposals]
  Proposals --> Review
  Review --> Public[Existing deliberate publication]
```

## OAuth and client boundaries

Use the maintained Better Auth OAuth provider with authorization-code/refresh
flows and exact client registration. Do not hand-roll a token issuer or accept
tokens minted for another service. Register clients through administration.
Anonymous dynamic registration and remote client-metadata fetching are disabled.

Publish resource and authorization-server metadata. Validate canonical resource,
redirect URI, PKCE, grant type and requested scopes. Display the client identity,
requested permissions, expiry and approved source websites before consent. Store
only library-managed hashed tokens; show credentials only when needed to create
the connection. Revocation, session expiry and current policy changes stop access.

## Media and visual review

Keep large binary upload separate from ordinary JSON control requests. Both the
bounded MCP upload and original-image REST upload must call the same validated
media pipeline. Require stable upload request IDs; changed retries conflict.
Library listing does not imply permission to disclose private image bytes.

Preview tools accept a page ID, locale and expected revision, never an arbitrary
URL. Render only already-authorized native content using an isolated browser with
JavaScript disabled and all external requests blocked. Private assets require an
explicit pixel grant and current asset access; otherwise use placeholders. Preview tickets are short-lived,
single-use, instance-local and never appear in review URLs or model responses.

Bound browser concurrency, capture duration, viewport/slice height, file size and
request frequency. Recheck authorization after expensive rendering. A missing
browser or unsupported sandbox returns an unavailable result. See the
[preview runtime contract](../guides/automation-preview.md#runtime-and-isolation).
Publication review must still check facts, links, image rights and accessibility.

## Event preparation and retries

Reuse the atomic event-template coordinator for a new event and its pages/forms.
Use the current staff member as manager; model-supplied identity is not authority.
Provide safe starting presets and a reviewed copy of a permitted source event.
Use stable request IDs and the exact reviewed snapshot on retries. Never copy
participants, payment evidence, credentials or external provider state.

Draft page, form, package and prize edits keep their owning service's revision
checks. Readiness returns actionable content/configuration blockers and review
links rather than participant records. Operational proposals bind their exact
payload and expected state to the current organization/event and a real author;
staff can apply, reject or resolve a stale proposal in the existing workspace.

## Verification and growth

Every operation supplies an input/output schema, valid example, scope, current
authorization, safe error and concise model-facing description. Update generated
OpenAPI, prompts, coverage policy and source fingerprints together. Images are
returned as MCP image content, with metadata as structured output; never repeat
large base64 payloads in explanatory text.

Test expired/replayed OAuth codes, wrong audience/redirect/PKCE, changed membership,
revoked credentials, cross-event IDs, private bytes without scope, hostile image
payloads, preview SSRF/network isolation, stale revisions and conflicting retries.
Exercise the local flow from connection through private event preparation and
preview with synthetic records and Mailpit. External ChatGPT, Claude or provider
integration needs a separate check against the configured HTTPS installation. See
[security testing](security-testing.md), [testing](testing.md) and the
[API/MCP contribution contract](automation.md).
