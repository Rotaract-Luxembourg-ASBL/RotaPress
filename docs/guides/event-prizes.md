# Managed event prize gallery

The prize showcase publishes editorial content independently of Luma, purchases,
entries and draws. Prize descriptions and quantities do not establish financial
eligibility or allocate entries.

## Prepare and publish prizes

Open an event at `/admin/events`, add **Prizes** through its feature controls, and
confirm activation. Website is required. Themes and page sections never enable it
implicitly. The **Prizes** panel keeps a saved list and a private editor for the
selected prize.

1. Choose **New prize**. Enter its title, description, quantity and display order.
   Optionally select a public image with alternative text and a published donor
   or sponsor from the managed Partners & Sponsors library.
2. **Preview prize** displays current input privately. **Create prize draft** or
   **Save prize draft** persists it without changing the published gallery.
3. Choose **Publish prize** and review the saved prize. Publication requires the
   event's publication authority, recent authentication and the current version.
4. In the event page builder, add **Published prizes**, choose its heading and
   publish the page. Page placement and individual prize publication are separate.

The catalogue allows up to 200 prizes per event. Quantity is an authored display
number from 1 to 10,000; it does not reserve stock, create entries or promise an
award. Display order is a nonnegative number; matching positions have a stable
identity-based order. Title, description, image, quantity and order changes stay
private until the changed prize is published again.

**Remove from published gallery** clears the current public pointer and retains
the draft and earlier publication snapshots. This reviewed removal remains
available to authorized publishers when Prizes is disabled or the event is
cancelled or archived. It permits deliberate removal of retained donor references
without reopening editing or public access. Reload after another staff member's
changes; stale versions fail instead of overwriting their work.

## Images and shared donors

Use the existing event media picker. Images must already be public club assets;
event editors cannot read the private library or change an asset's visibility.
The server checks media ownership and public visibility even when saving drafts.
It does not fetch arbitrary image URLs or introduce another upload workflow.

Draft references protect selected images from deletion. Every retained publication
revision keeps its own image reference, and the current public prize additionally
prevents its image being made private. Removal from the gallery releases that
public requirement while retaining historical references. Disabling a feature or
hiding the page section does not delete references or publication history.

Donor selection uses the current published partner profile, never its private
draft or contact data. A later deliberate partner publication updates its name,
logo and website everywhere that selects it, including prize cards. The prize's
own description and publication revision remain unchanged.

A selected donor cannot be unpublished while any prize still has an active
published reference. This protection also retains references from disabled or
archived events. Remove the donor and publish the changed prize, or remove the
prize from its published gallery first. Partners & Sponsors lists accessible prize
placements; staff without that event's scope see only a restricted placement.

## Access, lifecycle and preservation

Event managers and authorized club administrators can edit and publish prizes.
Assigned event editors can prepare drafts but cannot publish or enable features.
Registration managers receive no prize-editing authority. Every private operation
uses the current trusted organization/event scope; a browser event or prize ID is
not authorization.

Public projections contain only current published prize fields and public donor
profiles. They use the same published-event visibility and module gates as the
event website. Unlisted events remain absent from listings; private events still
require current authorized event staff. Draft prize content never appears merely
because the event or its Website page was published.

Disabling Prizes hides its output and prevents draft editing or new publication,
while preserving records. Disabling Website suspends Prizes after confirmation;
reenabling Website does not resume it automatically. Deliberately reenabling
Prizes can restore retained published output. Readiness checks both a published
prize and a visible published page section before describing the gallery as ready.

Cancellation follows existing editorial page behavior: published prize content can
remain alongside the event's cancellation notice. It offers no participation action.
Event unpublication or archive removes public access. A hidden section retains its
content and references; a visible Prize section cannot be newly published while
Prizes is unavailable. A saved disabled section remains available for later editing.

Migration `0026_event_prize_gallery` binds prize identities and publication pointers
to the same event and organization. The runtime role cannot update or delete prize
publication revisions. Mutations serialize with membership, assignment, partner
publication and media changes through the existing organization lock.

Copying an event includes prize drafts in the exact reviewed copy token. New prize
identities retain title, description, image, donor, quantity and order, with new
draft media references. Publication pointers and history are excluded. A changed
source invalidates the review, and unavailable images or donors reject the copy
atomically. See [event starting copies](event-presets.md).

## Entries and draws

The gallery publishes prize descriptions and quantities; it does not grant entries
or establish payment rights. Use the separate [demonstration entry register](event-entries.md)
and [draw workflow](event-draws.md) for their audited local operations. Real paid
activation and real draws remain outside the supported release scope.
