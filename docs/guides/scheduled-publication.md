# Scheduled CMS publication

Schedule deliberate, one-time publication of a saved CMS revision.
It reuses the existing editor, permissions, validation and publication transaction.
Club pages, event pages, shared sections, headers and footers use the same workflow.
It does not schedule event-detail snapshots, menu/settings publication or theme
activation, and it does not enable an event module.

## Editor workflow

1. Open content from Website at `/admin/website`, the shared site
   editor or its existing event workspace. Save and preview the intended draft.
2. Open **More page actions** (or **More shared part actions**) and choose
   **Scheduled publication**. The view identifies the content and language. Shared
   content also identifies its scope and currently affected published pages.
3. Enter a future date/time in the displayed browser time zone. Review and confirm
   the saved revision and publication time. Unsaved edits cannot be scheduled.
   Scheduling does not change the public website.
4. An existing schedule can be replaced only after reviewing its current identity.
   The replacement cancels the old job atomically. **Review cancelling schedule**
   cancels pending or claimed work without changing the current public content.
5. **Refresh publication status** shows the ten most recent jobs. A due job waiting
   for processing is labelled delayed; an expired worker lease is also shown as
   delayed. Completion is displayed only after publication commits.
   Refreshing also updates the editor's published-state indicator without replacing
   unsaved metadata or blocks.

Scheduling requires current publication authority for the specific resource.
Current readers of that content can inspect its job history. Private APIs use
`no-store`; anonymous users cannot inspect jobs or queued revisions. No token,
requesting user identity, lease token or private provider data is returned in the UI.

The original sign-in session must remain valid until execution. The requested time
must precede its current expiry and be within 30 days. Signing out/revoking that
session, membership suspension, loss of publication authority or an incompatible
staff authentication policy prevents publication. Sign in and review a new schedule
when needed; the worker never manufactures or extends an authentication session.

## Content preservation and invalidation

The job stores a specific immutable revision and a publication generation. A new
saved draft or restoration invalidates the earlier scheduled revision. Immediate
publication or unpublication advances the generation, so a pending job cannot undo
the publisher's later decision, even if the draft ID did not change. Archived content
cannot publish. Cancelled/replaced jobs cannot regain authority through a worker retry.

The existing CMS publication method runs all scope, block, slug, reference and public
media checks again. Event module availability, event cancellation and current event
roles remain authoritative. Scheduling an event page does not publish event details
or bypass private/unlisted visibility. Theme presentation and administration styles
are unchanged; scheduled shared parts still reference the shared published menus.

## Durable local execution

The additive migration `0015_sturdy_anthem.sql` creates a purpose-specific publication
job table with scoped content/variant/revision foreign keys and one active job per
language variant. No arbitrary payload, executable code or general task framework
is accepted. A request ID makes repeated scheduling return its existing receipt.

`node scripts/pnpm.mjs dev` invokes the existing bounded job command every 30 seconds.
It now processes form notifications and up to five due publications. For an explicit
invocation, use `node scripts/pnpm.mjs jobs:run`. A production `start` command does not
create a scheduler; a separately authorized deployment must arrange bounded calls.
The browser can close after scheduling. If the runner is stopped, jobs persist and
remain pending until it resumes; expired sessions still prevent old work from running.

Workers atomically claim due jobs with `FOR UPDATE SKIP LOCKED`, a unique lease token
and a one-minute lease. They recover expired claims and allow three attempts total.
Known stale/access failures cancel the job; invalid publication dependencies fail it.
Unexpected infrastructure errors receive bounded retries one minute apart. Error
history and process output contain only safe codes and counts, never raw exceptions.

The final publication, media-usage changes, audit entry and successful job receipt
commit in one transaction, serialized with CMS and permission mutations. This avoids
the external acknowledgement gap that still applies to SMTP notification delivery.
Separate worker invocations can safely see the already completed result after restart.
Cancellation that commits first prevents a claimed worker from publishing. If a
publication has already committed, cancellation reports that the job finished.

## Verification and limits

C09 covers replay, cancellation, stale revisions and worker recovery. B02 covers
publication through the actual editor. See [testing](../development/testing.md).
A production scheduler and deployment configuration still need verification.
