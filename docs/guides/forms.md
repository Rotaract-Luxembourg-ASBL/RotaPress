# Forms and submissions

Use Forms for contact messages and membership applications. Event enquiries and
free registration use the same editor from their [event workspace](event-registration.md).
Published definitions are immutable, and answers remain tied to the version the
visitor submitted.

## Author a form

Open `/admin/forms`, choose **New form**, search the template gallery and try a
template before creating a private draft.

The canvas shows the form beside its question properties. Insert questions at a
chosen position, drag or use buttons to reorder, and use Undo/Redo while editing.
Supported questions include short/long text, email, phone, dropdown, single and
multiple choice, checkbox, date, time, consent, number, website and rating.
Headings and page breaks organize up to 60 elements into up to ten pages.
Choice questions support up to 30 distinct options. The Design tab controls
themes, corners and spacing; individual questions can use full or half width.

Each field has a label, help text and required setting. Use the consent label
and help text for the wording visitors should read. Required consent must be
checked. The published wording is retained with the response.

A question can appear or become required when earlier answers meet All/Any
conditions. Text, choice, multiple-selection and numeric comparisons are available.
Hidden answers are excluded from submission. Dependencies must remain after their
source questions; removing a source requires updating its dependent rules first.
The rules are declarative and never execute scripts.

The working preview demonstrates questions, conditions, page navigation and the
confirmation message. Preview answers are never submitted. **Save draft** keeps
changes private; **Publish form** saves entered changes and publishes the resulting
revision. The server validates every page when accepting answers. Editing a draft leaves
the existing published version available. A concurrent draft conflict retains
the entered content and offers an explicit reload of the saved version.

The public form is available at `/forms/{formId}` once published. Forms can also
be referenced from the website's Form block. Website publication checks that
referenced forms belong to the club and are published. Archiving a form stops
new submissions and clears its public version without deleting prior answers.
Restore and publish it again to resume submissions.

## Receive a response

Contact forms accept anonymous responses. Membership application forms require
a signed-in, verified identity before submission. The applicant's identity
comes from the server session. Form fields cannot grant a role or approve
membership. An accepted application enters the membership review workflow;
approval remains a separate action by an authorized club reviewer.

The membership page uses the club's active published membership form when one
exists. If several are published, it uses the earliest-created active form;
archive that form to use another published application. Eligible applicants see
the same reusable fields there and their status refreshes after an accepted
submission. Pending, approved and suspended members
keep their status view. The simple account-only application remains available
only when the server confirms that no published membership form is configured.
Errors loading that configuration do not fall back to the simple application.

The browser retains entered answers after an error. A definite rejection, such
as invalid input, leaves the fields editable. If a network failure or server
error makes receipt uncertain, the fields stay locked and **Retry response**
sends the original answers and request identifier. The server returns the
original receipt for an identical accepted request. **Edit response** requires
confirmation that the earlier response may already have been received; it then
starts a new response identifier. This deliberate choice can create a duplicate.
After a contact receipt, **Send another message** also deliberately starts a
separate response. Unsaved public answers and retry details remain in page
memory and do not survive closing or reloading the page.

The server validates the exact form version, field types, limits, conditions
and permitted keys. Public input never chooses the club, recipients or
membership status. Unknown fields and hidden answers are rejected. Submission
routes enforce same-origin mutation checks, a 64 KiB request limit and shared
database rate limits. Validated answers are limited to 50,000 bytes; the request
limit leaves room for the version, request identifier and JSON structure.
Anonymous attachments are not supported.

## Review privately

The builder's **View responses** link opens Response center with that form selected.
Search and filter by form, review status and received date. Counts cover all matching
results; the inbox displays pages of 100 records. The existing per-form submission
list also remains available. CSV export preserves question labels and versions,
neutralizes spreadsheet formulas and supports at most 5,000 responses per export.

Submission detail displays the preserved labels, help and consent wording,
answers, published version and received time. A membership response also shows
the verified applicant and the membership status at submission. The current
membership record remains in Members. Marking a response `reviewing` or
`closed` never changes membership approval.

Only authorized reviewers can read submissions. Export and mutations are
separate server capabilities. The editor preset can author forms but cannot
read or export answers or edit recipients and retention settings. CSV output
quotes data and neutralizes spreadsheet formula prefixes. Private records and
exports are returned without public caching.

The **Delete submission permanently** action requires deliberate confirmation.
It removes that response and its notification records. It does not delete or
change the member's account or membership.

## Notifications

Owners and administrators can configure up to ten notification recipients per
form. Leave the list empty to save responses without sending notifications.
Recipient addresses are private settings and never come from public answers.

The submission and its notification records are committed together before
email delivery runs. An SMTP failure therefore leaves the response available
for review. Notification messages contain a private administration link rather
than copying submitted answers into email.

The detail page shows queued, processing, sent or failed status, attempt count
and a safe error code. Sent means the configured SMTP server accepted the
message; it is not a guarantee that an external inbox received it. Failed
notifications can be explicitly queued again for recipients still present in
the form's settings. Removing a recipient stops its pending delivery.

The small PostgreSQL outbox uses bounded batches, leases and delayed retries.
After five unsuccessful attempts, the notification remains visibly failed.
This provides durable attempts, not a promise of exactly-once SMTP delivery
after an interrupted acknowledgement.

The Docker hosting recipe and development launcher run notification jobs
automatically. To process one bounded batch in a configured development checkout:

```sh
node scripts/pnpm.mjs jobs:run
```

This command uses the project's restricted runtime database configuration and
does not run migrations. Running the web server alone does not process queued
notifications; use the [hosting recipe](hosting.md) for the managed web and jobs
processes, or follow the [container contract](../development/hosting.md).

Notifications use the same configured sender as sign-in. Configure the initial
sender through [first-run email setup](email-setup.md), then manage connections
and templates in [Email settings](email.md). Authoring forms and saving submissions
do not need an email provider; queued email needs a working sender. A development
capture inbox never sends messages to real recipients.

## Retention

Recipients and retention settings are saved separately from published form
content. A blank retention period means keep responses until deliberate
deletion. Setting a number of days does not automatically delete anything.

**Preview retention deletion** selects up to 1,000 responses older than the
saved period and shows the cutoff and selected count. A separate confirmation
is required before deletion. The server checks the preview against the current
period and exact selected records. If that selection changes, generate another
preview. Additional batches require their own preview and confirmation.

Deleting retained responses also removes their notification records. Club
owners must choose collection wording and retention settings suitable for
their actual use before collecting responses.

## Related workflows and limits

Use [event registration](event-registration.md) for event forms, booking capacity
and event staff roles. Website Form blocks can reference published club forms;
event-owned forms stay within their event. Question types do not change the
audience, event permissions or membership approval rules.

Attachments, signatures, payments, multilingual form definitions and booking-aware
response erasure are unsupported. Configuring an outbound integration does not
grant it access to other forms or change publication and review permissions.
