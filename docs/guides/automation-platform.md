# Whole-platform assistant actions

RotaPress MCP and REST share one operation catalogue. Connect an approved staff
identity, choose its permissions, then ask for the work. Requested actions execute
directly within those grants. There is no second approval screen in RotaPress.
Current membership, organization/event access, recent identity where required and
exact versions still apply. Your AI client's own tool controls remain its choice.

Existing keys and OAuth grants never expand automatically. Edit an OAuth
connection's allowed actions and approve fresh consent to opt into new scopes;
an access key needs an explicitly scoped replacement. Selecting a grant does not
request an action or authorize changes to unrelated records.

| Task                                           | Explicit grants                                                  | Important boundary                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Organize page drafts and reusable sections     | `website:organize` + `website:write`                             | Parent/order are independent of page URL; publication is separate                       |
| Read PDF/audio/video metadata or bytes         | `files:read`, separately `files:download`                        | Image grants do not expose private file bytes                                           |
| Upload or publish files                        | `files:write`, separately `files:publish`                        | Upload stays private; publication uses current fingerprints                             |
| Edit, organize, hide or delete images/files    | `media:manage` or `files:manage`                                 | Existing grants stay unchanged; published and retained references protect files         |
| Crop, rotate or flip an image                  | `media:manage`                                                   | Saves a private copy; replacing a placement is a separate versioned edit                |
| Archive, restore or unpublish stories/profiles | `projects:manage` or `directory:manage`                          | Exact versions and current publisher authority apply; saved history is retained         |
| Edit, publish or remove albums                 | `albums:read`, `albums:write`, `albums:publish`, `albums:manage` | Published linked galleries use the published album; referenced albums cannot be deleted |
| Read or decide membership                      | `members:read`, `members:decide`                                 | Decisions do not change staff roles                                                     |
| Change roles or ownership                      | `access:roles`, additionally `access:ownership` for owners       | No self-escalation; current owner rules protect the last owner                          |
| Read or update responses                       | `responses:read`, `responses:write`                              | Private answers are separate from form-definition access                                |
| Export or erase responses                      | `responses:export`, `responses:delete`                           | Exact form/filter or response/version; registration history is retained                 |
| Change forms or settings                       | `forms:manage`, `forms:settings`, `forms:delete`                 | Deleting a form also requires `responses:delete`                                        |
| Read or cancel registrations                   | `registrations:read`, `registrations:manage`                     | Cancellation releases a place, keeps history and never refunds a payment                |
| Read or change guest access                    | `guests:read`, `guests:access`                                   | Exact source and email rechecked; no login bypass or automatic invitation mail          |
| Operate or cancel events                       | `events:operate`, `events:manage`                                | Native version, feature dependencies and booking-count checks remain                    |
| Edit or activate notification templates        | `communications:templates`, `communications:publish`             | Provider credentials and sender setup are unavailable                                   |
| Retry failed response alerts                   | `communications:send`                                            | Existing configured recipients only; queued does not mean delivered                     |

Start with `automation_capabilities` to obtain actual grants, enabled features and
`contentGeneration`. Read `automation_task_prompt` or the
`rotapress://platform-workflows` MCP resource for the client workflow. The live
tester shows each action's effect, required grants and input/output schema.

Offset-based website, image, file, event, form, project and directory lists return
`total`, `offset`, `limit` and `nextOffset` with their records. The total describes
the authorized matching collection, not just the returned page. Follow
`nextOffset` until it is null. Newer page-based collections return `total`, `page`
and `pageSize`; guest candidates and guest access each have their own pagination.
The in-app tester shows these counts and readable collection summaries, with raw
response data available in its collapsed technical view.

## Retry and recover work

Content and operational mutations require a UUID `requestId`. Use one ID per intended
action and retry its identical input after a timeout. The domain mutation and its
receipt commit together. A changed input, another connection, revoked authority
or a reset cannot reuse the old result. Replays return the original receipt, not
a new read of current state; reread a record when its current state matters.
Resumable upload chunk, finish and cancel actions instead reuse their durable
upload session ID; chunk retries must keep the same index and bytes.

Optional `taskId` groups related receipts. `automation_task_receipts` returns
bounded metadata for the same account and connection, restricted to currently
granted operations. It does not expose cached private answers. A task is not a
background job or an atomic batch: if step three fails, completed steps one and
two remain committed. The client records targets, expected versions, request IDs
and results, then resumes only the remaining authorized steps.

Supply `expectedGeneration` from capabilities on mutations. Binary image upload
uses `X-RotaPress-Content-Generation`. After a content reset, old or missing
generations fail. Read fresh capabilities/targets and use new request IDs. Reset
clears receipt payloads and exports but retains tombstones preventing reuse.
Authentication, Google login and provider configuration are not reset by tools.

## Files and private exports

`files_upload_start` creates a resumable session for PDF (25 MiB), audio (100 MiB)
or video (500 MiB). Upload canonical base64 chunks of 64 KiB using
`files_upload_chunk`, then finish validation with `files_upload_finish`.
`files_upload_status` returns received chunks for recovery. Actual type inspection
and current authority run before persistence. Uploads remain private.

`files_read` returns bounded authenticated bytes. `responses_export` creates a
private CSV for one authorized form and exact filters, bounded to 5,000 responses
and 10 MiB. The export expires after ten minutes and belongs to the same account
and connection. Read `responses_export_read` chunks, decode in offset order,
follow `nextOffset` and verify SHA-256. Clients can request the returned
`downloadUrl` with the same connection's `Authorization` header for a CSV
attachment, or use HEAD for metadata. This dedicated download accepts the
originating REST token, MCP key or MCP OAuth bearer; it does not grant MCP
credentials access to other REST operations. The URL carries no credential and cannot be
used publicly. Both transports recheck current access and return private,
non-cacheable data. Revocation, reset or loss of form access blocks further reads. A retry
after expiry needs a new export request ID.

## Website previews and albums

`website_pages` searches pages and reusable sections with real pagination.
`website_page_organize` checks both content and placement versions.
`website_page_move` moves a page beneath a parent and before an exact sibling,
checking the destination version and rejecting cycles. It does not change URLs.
`website_pages_restore` restores exact archived selections as private drafts with
`website:organize`, `website:manage` and current staff publication authority.
`website_pattern_create` creates a private reusable native section. There are no
posts or executable extensions in these workflows.

`website_preview` retains its published-shell behavior. For combined draft work,
call `website_composition_review`, then `website_composition_preview` with the
exact returned settings/section manifest. Inspect desktop and phone slices.
Version changes during rendering fail instead of mixing states. Private images
need `media:inspect`; interactive blocks remain preview placeholders.

Album draft edits do not change public galleries. Publish an exact album version
to update linked galleries; each image must already be public through its own
requested publication. Copied galleries remain independent.

`responses_sources` searches authorized form and event titles under `responses:read`
with accurate totals and pagination. It discovers response sources without adding
form-authoring access or returning participant answers.

## Version 2 migration

Mutation requests now require `requestId` across page/form/event creation and
editing, website settings, calendar/project/directory actions, image metadata,
and publication. Preserve the ID and exact payload when retrying a lost response;
use a new ID for a new edit or a new attempt against refreshed versions. Receipts
belong to the same authenticated connection, so a REST key and a separate MCP
key cannot replay each other's requests. Refresh schemas and update saved client
examples before sending version 2 requests.

Version 2 removes `events_propose_settings`, `events_proposals` and their
administration review/apply routes. Replace them with `events_registration_set`
or `events_module_set` after explicitly opting into `events:operate`. Existing
`events:prepare` grants keep draft preparation only. Historical proposal database
records are retained solely for forward migration/reset; no runtime handler
applies them. Refresh your client's tool discovery after upgrading.

Connection management, credentials, authentication policy, provider setup,
content resets, arbitrary email, payment/refund actions and draws remain outside
automation. A saved or queued receipt is never proof of provider delivery,
deployment, external-client acceptance or completed payment.
