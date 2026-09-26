# Event forms and native registration

Use event forms for enquiries and native free registration. Enquiries collect
responses; registration also reserves a place against the event's capacity.
Both use the [form editor](forms.md) and keep submitted answers private.

## Workflow

1. Open `/admin/events` and choose an event.
2. Enable Website, then explicitly enable Forms under **Event features**.
3. Create an event enquiry or free registration form. Open it in the existing
   form builder, edit its fields, try its draft preview, save and publish.
4. For bookings, explicitly enable Registration. Select the event's published
   registration form, set an optional capacity, choose whether to open registration,
   and confirm **Save registration settings**.
5. Publish the event's Website page and event details. Published enquiry forms and
   the configured registration form appear in event navigation.

Public routes use `/events/<event-slug>/<locale>/forms` and `/registration`, with a
published landing page in that language. Forms currently have one editable language;
multilingual form definitions are deferred. A published enquiry form also works at
`/forms/<form-id>` subject to the same event access policy. Registration forms cannot
be submitted through the ordinary form endpoint, which would bypass capacity.

Registration requires a real verified sign-in. Successful submission shows a
confirmation and saves a place in `/registrations`. A visitor can cancel their own
registration there after explicit confirmation. Cancellation preserves the response
and booking history and releases capacity. Registration does not create membership.
Attendee confirmation/cancellation emails are deferred; confirmation appears on
screen and in the registration list. [Guest access](guest-portal.md) uses separate
explicit grants.

## Authority and privacy

The event manager can publish forms, configure staff notification recipients and
registration, review/export responses, and cancel registrations for that event.
An event editor can prepare form drafts but cannot publish or read responses.
The Registration manager assignment permits response review/export, status
changes and registration cancellation for the assigned event. It cannot edit pages,
publish forms, change registration settings or manage the team. Club-wide roles
remain separate. Every operation reloads current membership and event assignment.

Event forms are excluded from the global form list and global CMS form references.
The Forms event feature renders them using the existing public form renderer.
Event CMS pages still accept their previously approved block subsets; arbitrary
cross-event form embedding is not enabled. Draft definitions remain authorized.
Public form reads/submission and registration share the event's publication,
visibility, archival and feature checks. Private events currently admit authorized
event staff only; a verified email alone does not grant private event access.
Unlisted events remain available by direct link without joining public discovery.

Disabling Forms explicitly suspends native Registration. Disabling Website suspends all
active dependents. Public operations stop, pending event notifications pause, and
history remains available to authorized reviewers. Re-enabling a dependency does
not automatically re-enable dependents or resend sent notifications. A notification
already handed to SMTP cannot be recalled; eligibility is checked before claiming
and immediately before delivery. Saved submissions survive delivery failure.
Existing registrations remain valid when a module is disabled or the event is
archived. Self/staff cancellation remains available for those retained records.
Cancelling the entire event deliberately closes participation and cancels confirmed
bookings while retaining history. See [event cancellation](event-presets.md).

## Capacity and retained bookings

The server validates the submitted form version and reserves capacity while saving
the response, booking and staff notifications in one transaction. A rejected booking
leaves no partial response or reserved place. Each authenticated person can have
only one confirmed place per event. Rebooking after cancellation starts a new
request; retrying an old request returns its original, possibly cancelled, booking.

Each event has one authority: none, native or [Luma link mode](luma.md#registration-links).
Publishing a Luma link selects external authority without importing participants.
Once any bookings exist, changing the authority or configured form is blocked.
Closing registration remains available. Capacity cannot
be reduced below the number of confirmed places. Registration response deletion and
retention deletion are blocked to preserve booking integrity. Booking-aware response
erasure is not supported.
