# Scheduled CMS publication

Schedule one-time publication of a saved revision from the page or shared-part editor.
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
Current readers of that content can inspect its job history. Anonymous users cannot
inspect jobs or queued revisions, and private responses are not publicly cached.

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

## Background execution and recovery

The [Docker hosting recipe](hosting.md) runs scheduled jobs automatically. The
development launcher also processes jobs periodically. To run one bounded batch
in a configured development checkout:

```sh
node scripts/pnpm.mjs jobs:run
```

Running only the web server with `start` does not start a job runner. Use the
managed hosting recipe or follow the [container contract](../development/hosting.md).
The browser can close after scheduling. If the runner stops, jobs remain saved
until it resumes; expired sessions still prevent old work from publishing.

Only one active schedule is allowed per language variant. Retrying the same
scheduling request returns the saved schedule. Interrupted workers can recover
unfinished jobs, with at most three attempts. Lost access or a changed revision
cancels the job; invalid publication dependencies mark it failed. Review the
reported reason, correct the content or permissions, then schedule again.

Publication, media references, audit history and the completed job are saved
together. A retry cannot publish the same completed job again. Cancellation that
saves first prevents publication; if publication has already finished, cancellation
reports that outcome and leaves the published content unchanged.
