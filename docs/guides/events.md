# Events

Open **Events** in administration to create and manage an event. Each event has
one workspace for details, its page, participation, packages, guests, prizes and
team access. A feature appears when it is available and deliberately enabled.

## Create and configure

Create an event with a name, schedule, time zone, visibility and responsible
manager. Review a starting preset or a copy of an accessible event. Only selected
features and their required dependencies are enabled. Starting content is private;
copying excludes participants, credentials, source links and operational history.
See [starting copies](event-presets.md).

Club staff capabilities and assignments determine access. An assigned event editor
works only within that event; membership alone grants no editing permission.
Sensitive team and lifecycle changes require current authorization and review.

Use **Event features** to enable or suspend a tool later. Disabling a dependency
requires review of affected features. Records remain retained; re-enabling the
parent does not silently reactivate dependents or replay old notifications.
Club-wide availability in Integrations also applies on the server.

## Design and publish

The [event page designer](event-page-design.md) uses the same CMS renderer and
revision services as the website, with independent event appearance. Choose a
layout, edit sections and preview current input privately. Save a draft before
leaving; saving alone changes nothing public.

Publication reviews the exact event/page versions. Restoring history creates a
private draft. Page language and availability, event visibility and feature state
all affect whether visitors can see it:

- **Public:** discoverable when the event and website page are published and enabled.
- **Unlisted:** accessible through its public link, omitted from discovery.
- **Private:** requires the appropriate current scope; knowing the URL is insufficient.

The canonical event page is `/events/<event-slug>/<language>/website`; earlier
UUID-based links remain supported. `/events` lists eligible published events.
The built-in directory designer belongs under **Events > Directory design**.

Guest experience/readiness distinguishes saved placement, published placement and
actual visitor availability. A section in a draft is not a live registration page.
Contact, flyer and sharing sections use saved configuration and deliberately public
media. Sharing actions use the published canonical URL.

## Participation and packages

An event has one registration authority: none, native free registration or Luma.
Enquiry forms collect responses without reserving a place. Native registration
reserves capacity transactionally for a verified account and supports cancellation.
Use [registration](event-registration.md) for setup and access boundaries.

An event form must belong to that event. Publish the selected form and configure
registration before placing its section in the page. Removing a section preserves
the form and all responses. Saved registration settings, published form content
and event-page publication have distinct effects.

Packages describe what visitors can choose. Save package drafts, review prices and
publish their snapshots explicitly. Checkout links use declared Luma sources and
current external registration authority. Closing a source stops new checkout without
erasing its history. A displayed price, package link or ticket count proves no payment.
[Luma](luma.md) explains source-scoped imports and purchase observations.

## Guests and prizes

The [guest portal](guest-portal.md) requires explicit grants bound to a verified
identity and booking source. Importing a participant or publishing an event does
not grant access. Guests see only their permitted published details and records.

The [prize gallery](event-prizes.md) publishes prizes and selected donor profiles
separately from the page layout. The [entry register](event-entries.md) and
[draw tools](event-draws.md) are demonstration features. They do not activate real
paid entry or certify a real draw; approved public winner names are a separate
publication from private operational records.

## Cancellation and limits

Cancel an event only after reviewing the impact on confirmed native registrations.
Cancellation closes participation and retains the history; archiving also removes
public access. These operations do not send attendee email or issue refunds.
See [cancellation](event-presets.md#cancel-an-event).

Live provider validation, online check-in, real paid draws and production hosting
remain separate work in the [roadmap](../development/roadmap.md). Domain setup
cannot activate hosting or change authentication origins.
