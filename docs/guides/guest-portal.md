# Event guest access

The guest portal gives an invited person access to their own published event
details and booking status. Invitations are tied to a confirmed native registration
or an eligible imported Luma booking. Knowing a portal URL is not enough to enter.

## Staff workflow

Open an event in `/admin/events`. In **Guest portal**, explicitly enable the feature
after Website is enabled. Publish the event before granting access. A club owner,
administrator, assigned event manager or assigned registration manager can select
an existing confirmed native registration or a present, non-declined Luma guest
with a valid email address. Event editors cannot manage guest access.

Review the confirmation showing the recipient and event. Grant creation and
revocation require a recent verified staff session and current event authority.
The standard staff Google policy still applies. Granting access sends no email.
Share the normal `/guest` URL with the invited person.

The panel shows invitation, claim and revocation state. Revoke access without
cancelling the booking, including after feature shutdown or event archive. A later
invitation creates a new grant; the revoked grant cannot be claimed again.

## Guest workflow

Sign in through the existing email verification code flow using the invited email.
`/guest` lists only available explicit invitations for the trusted verified identity.
Choose **Accept invitation** to bind the grant to the current account. Repeated
claims return the same grant. Native invitations also require the registration's
original user ID, so matching an email alone cannot claim another account's booking.

`/guest/<eventId>/<grantId>` displays published event title, description, venue and
schedule, plus the guest's own booking status. Native guests can open **My
registrations** to use the existing cancellation workflow. Luma guests see the
observed status and timestamp. Provider observations are not proof of payment or
prize eligibility. Guest sign-in never creates a club membership or staff grant.

An explicit invitation can allow these published details for a private event. It
does not change the general public event gate or open private CMS routes. Draft
fields, other guests, submitted answers, provider identifiers and credentials are
excluded from guest pages.

## Purchase details and summaries

The portal can show saved purchase observations for a claimed Luma
booking. An authorized event or registration manager explicitly refreshes that
guest's detailed provider record; importing guests or issuing an invitation does
not fetch purchases. Guests can reload their saved orders/tickets, follow the
official Luma payment-history link and download a private text summary. The summary
is not a payment receipt or invoice and issues no entitlement.

Purchase reads require the existing claimed-grant and portal gates plus an enabled
source, API link, Registration feature and checked connection. Earlier financial
details are withheld after a recipient change or a detected identity/ownership
mismatch. Closing new bookings does not prevent authorized staff from observing
historical refunds. See [purchase operation and preservation](luma.md#purchases)
for the exact workflow, identity holds and separately retained immutable evidence.

## Access changes and retained history

Every request verifies current grant ownership, organization and event scope,
source identity and availability, published event state and module dependencies.
Revocation, disabled/suspended portal, disabled Website, unpublication, archive or
event cancellation prevent portal reads and claims. Cancelling the native booking,
changing its email, or changing/removing/declining the imported source blocks access.
The ordinary native registration history remains available after cancellation.

Module disable preserves records. Re-enabling Website leaves its suspended portal
disabled until deliberately enabled. Re-enabling the portal makes otherwise valid
existing grants usable again. Copying an event copies reviewed configuration only,
never its guest grants, claims or bookings. Themes and site parts do not modify
guest access.

Each grant belongs to one booking in the same club and event. Only one active grant
can exist for that booking, and a native guest must be its original account holder.
Access is rechecked when viewing details or claiming an invitation. Private responses
are not publicly cached; claims are rate limited and recorded in audit history.

## Limits

Staff lists are bounded to 200 recent records per source and 200 grants; guest
discovery considers the latest 100 invitations. Search/pagination, invitation
emails, guest documents/forms, ticket transfers and self-service email rebinding
are unsupported. Native registrations and Luma imports stay separate. See
[registration](event-registration.md) for native bookings and [Luma](luma.md)
for source and purchase configuration.
