# Event starting copies and cancellation

Start an event with a preset or a reviewed copy of an event you can edit. Copies
create private pages, forms and configuration for the new event. Its appearance
is independent of the club website's design and shared header/footer.

## Create from a reviewed starting copy

Open `/admin/events`, choose **New event**, and enter the new
event's details and responsible manager. **Starting setup** offers three small
presets or an existing event the creator can edit. For a preset, select only the
features needed; deselect them all for a details-only draft. Required dependencies
are selected together and checked by the server.

| Starting copy                        | Features after explicit confirmation                        | Initial content                                                        |
| ------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Details only (deselect all features) | None                                                        | No pages or forms                                                      |
| Simple event                         | Website                                                     | Website draft                                                          |
| Networking                           | Website, Forms, Registration                                | Website draft and free registration form                               |
| Fundraiser                           | Website, Gallery, Sponsors, Forms                           | Three page drafts and an enquiry form                                  |
| Existing event                       | Its reviewed enabled, disabled and suspended feature states | Saved page variants, form definitions, package drafts and prize drafts |

Fundraiser's default selection does not activate payments, prizes or draws. These presets are event
configuration choices, separate from visual themes. They are editable starting
copies, with no later synchronization or overwrite when a preset/source changes.
Preset text starts in English; the existing CMS locale workflow adds translations.

New preset pages use independent event appearance without the club header/footer.
Selecting Registration places its section in the website draft; selecting Forms
without Registration places the generated enquiry form instead. Forms remain
unpublished, and registration stays closed until configured. The page builder
can add, edit, reorder, hide or remove these sections later.

**Review event setup** shows the feature states, pages, forms, package/prize drafts and registration
configuration without writing a draft. Check the activation confirmation before
creating. A changed source or changed configuration invalidates this review and
requires another review. A retry of the same confirmed creation returns the same
event. Creation of the event, manager assignment, features, content and registration
settings is one transaction; a failure leaves no partial event.

Only club owners/administrators with `events.create` can create. The responsible
manager must be a currently approved member. The server checks current authority
for preview and creation and verifies source-event access independently.

## Copy boundaries

Copies use new content/form identities and new unpublished revisions. Saved draft
page text, approved blocks, locale variants, public image references, form fields,
capacity and native registration authority are retained. Archived content stays archived.
Registration always starts closed. No published pointer is copied: pages, forms
and event details require their existing explicit publication steps.

Local package descriptions/prices copy into unpublished drafts with checkout
disabled and sources removed. Prize drafts copy with new identities,
retaining their descriptions, quantities, ordering, public images and published
donor selections. Prize draft versions participate in the reviewed copy token;
copied media gains its own retained usage. Prize publication pointers/history and
all operational allocations or entries are excluded. Invalid media or donor
references fail the whole copy. See [prize operation](event-prizes.md).

Participant identities, registrations, submissions, notification jobs/recipients,
previous revisions, original team assignments, credentials and provider connections
are excluded. Only the newly selected manager is assigned. Form retention settings
start unset. Event dates, venue, visibility and description come from the new-event
form rather than carrying an old event's schedule forward invisibly.

Existing pages, registrations, permissions and media visibility are untouched.
Saved page appearance and hidden-section selections are retained; legacy pages
keep their saved layout until deliberately changed and published in the builder.
Luma linkage and external authority are excluded; copied registration starts with
authority `none` when the source uses Luma. Public images are referenced through
the existing CMS media-usage records, not duplicated. Private assets cannot become
public through copying. Unknown or unsupported blocks and invalid source
definitions reject the whole operation with an error.
Copies are bounded to 200 page variants and 200 forms; exceeding the limit rejects
the copy rather than truncating content.

Review wording and event-specific URLs before publication. Links are preserved
exactly and may still point to the original event. Automatic URL rewriting, saved
custom template catalogues, complex overrides and executable template uploads are
not included.

## Cancel an event

An event's manager or club owner/administrator can choose **Review event
cancellation**. Registration managers and editors cannot cancel an entire event.
The review displays the current number of confirmed registrations and requires an
explicit checkbox. Cancellation requires recent authentication. The transaction
rechecks event version, current authority and the reviewed booking count; a changed
count requires refreshing the review.

Cancellation immediately closes event forms and registration, marks confirmed
bookings cancelled, and blocks new content/configuration changes. Public pages keep
their published content with a cancellation notice, and participation links leave
event navigation. Old form/registration links cannot accept new participation.
The public event directory marks the event cancelled. Archive it to remove public
access entirely. Private/unlisted visibility still applies to cancelled events.

Content, media, permissions, submission answers and booking history remain retained
under existing authorization. Team access can still be revoked or reassigned before
archival. Pending event notifications stop; mail already handed to SMTP cannot be
recalled. This action sends no attendee email or refund. Cancellation is terminal;
a later event can use a reviewed starting copy without inheriting cancellation.
Individual registration cancellation and archive/disable behavior remain distinct.
