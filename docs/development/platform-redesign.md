# Platform redesign delivery roadmap

This roadmap describes the coordinated administration, authoring, media and
assistant upgrade. It is implementation work, not a claim that all capabilities
below are available in a released installation. The existing application and
its domain services remain the foundation.

## Product direction

- A consistent administration interface with grouped navigation, a command
  launcher, predictable collections and focused editing workspaces.
- An advanced site builder with page hierarchy, patterns, responsive controls,
  recovery and exact draft previews. Page hierarchy does not rewrite public URLs.
- A media workbench with bulk actions, image editing, reusable albums and
  supported PDF, audio and video files. Administration uploads default public.
- Complete member, guest and operational journeys with current permissions.
- Shared REST/MCP capabilities, explicit grants and direct requested execution,
  with recoverable receipts rather than an additional approval workflow.

## Delivery sequence

| Stage | Deliverable                                                | Completion evidence                                                          |
| ----- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1     | Shared navigation, tokens, collections and editing anatomy | Desktop/phone and keyboard walkthroughs across administration                |
| 2     | Media workbench, files, albums and delivery                | Saved-state, upload, playback, reference and backup/restore checks           |
| 3     | Pages and visual authoring                                 | Pagination, bulk operations, hierarchy, recovery and preview/public matching |
| 4     | Remaining administration and account journeys              | Forms, responses, membership, events, bookings and guest walkthroughs        |
| 5     | REST/MCP parity and connection experience                  | Contract checks, current grants, execution replay and real-client evidence   |
| 6     | Controlled fresh start and release                         | Rehearsed restore, protected authentication, actual deployed commit/UI       |

These stages are not independent replacement applications. Shared services and
components are reused, and changes remain compatible with the retained schema
history. Posts, payment processing, campaign email, check-in and real prize-draw
activation are outside this redesign.

## Acceptance boundaries

Inspect actual geometry as well as action results. An attachment preview must be
visible when opened; the inspector scrolls independently and primary controls
remain available. Check desktop, tablet, 390px and 320px layouts with keyboard
navigation, focus return and no horizontal page overflow.

Collections retain query and return context. Bulk changes target exact selected
records and report conflicts without losing entered work. Server counts and
pagination obey the same authority as the records, including libraries beyond
the old 250-asset automation limit.

Authoring checkpoints are private recovery state, not a new published version or
an immutable revision for each keystroke. Preview composes the actual selected
draft pages, appearance and shared parts. Publication and revision restoration
retain current permission, dependency and version checks.

Media bytes require type-aware validation, bounded upload memory and authorized
delivery, including each range request. Backup and restore must support every
enabled file type before that file type is released.

New assistant capabilities require explicit additional grants. Existing
connections do not acquire authority through an upgrade. Current membership,
event/form scope, recent identity and owner protections apply to each operation.
Interrupted operations resume from durable results without duplicate effects.

## Fresh-start operating boundary

A content reset is a separately targeted operator procedure, never an automatic
migration or installation step. It requires a consistent database/files backup,
an isolated restore rehearsal and explicit identifiers for the target and retained
owners. It preserves Better Auth, Google configuration and account links,
installation identity, provider connections and approved owner access.

The procedure inventories an explicit content-table allowlist, checks foreign-key
dependencies, verifies protected state before commit, and retains a recovery
backup. It does not drop the shared schema, disable constraints, rotate credentials
or reinstall authentication. Machine-specific reset targets and command receipts
belong in ignored local handovers rather than this public roadmap.

The [operator procedure](content-reset.md) describes inventory, sealed backups,
isolated rehearsal, transaction checks and interrupted-file recovery.

## Verification and reporting

Extend the two principal browser journeys and the owning PostgreSQL regressions.
Run focused checks during implementation and full `verify` once per completed
application slice. Keep the existing 800-line authored-file limit and update the
shared API/MCP contract alongside public behavior.

Report code completion, local verification, deployed assets, real Google/MCP
checks and participant acceptance separately. A passing test or a successful
deployment does not establish all five.
