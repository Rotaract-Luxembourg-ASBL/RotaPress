# Luma integration

Luma is optional. RotaPress owns event content, local teams, forms and feature
settings. When Luma is the registration authority, Luma owns registrations and
payment state; imported records are timestamped observations, not a local payment
ledger. Local adapter checks use synthetic fixtures. Live verification is pending.

## Links

Enable Luma in **Integrations** and configure it inside the relevant event.
A validated HTTPS event link can support external registration without API
credentials. Save the link draft, review it, then publish it deliberately.
Publishing selects external registration authority; it does not import guests.

Events may have multiple declared checkout sources. Local packages have their own
drafts and publication snapshots; sources supply their checkout destinations.
Keep source identity explicit when configuring, importing or reviewing history.
Changing authority after native bookings exist requires a separate migration
rather than merging two authoritative participant lists silently.

Closing new bookings or a checkout source preserves history. Disabling its API
link or connection stops new remote reads. Copying an event excludes provider
links and credentials, leaves copied packages unpublished and disables checkout.

## Connections

Manage the API connection in **Integrations > Luma**. Authorized staff can save
credentials, review a calendar check, replace or disconnect a connection, and see
masked status. Credentials are encrypted with `INTEGRATION_ENCRYPTION_KEY` and
are never returned through administration DTOs.

Ordinary local setup blocks external Luma requests. `LUMA_API_REQUESTS_ENABLED`
is an operator restriction, separate from connection and event settings. Enable
it only for an authorized provider run, then restart both the app and job runner.
Losing the encryption key requires restoring the original key with retained data;
setup must not generate a replacement over encrypted credentials.

The adapter constrains requests to its configured provider origin and uses bounded
pages, timeouts and responses. The connection, source and current staff session
must remain valid across remote work and the final persistence transaction.

## Imports and recovery

Link each selected source to a checked API event identity. Review source-scoped
reconciliation explicitly. Imports retain provider identities and private guest
projections; public event copy and CMS publication remain independent.

A failed page is a failed run, not an empty participant list. Complete validated
results commit together. Replay keys, expected configuration, organization/event
scope and current authority prevent one source from replacing another's records.
Configuration changes and revoked access invalidate stale work.

Durable reconciliation uses the existing PostgreSQL job runner:

```sh
node scripts/pnpm.mjs jobs:run
```

`dev` invokes the runner periodically. Jobs have bounded retries, leases, cancellation
and failure state. Staff review the result or retry; reconnecting or re-enabling
features does not automatically replay old imports. Recurring unattended provider
reconciliation and provider writes are not supported release features.

## Notifications

Luma configuration provides a callback URL, selected notifications and a separately
stored provider signing secret. Reception can be enabled, paused or removed.
The receiver verifies signatures over the raw body, validates signed timestamps,
bounds requests and records duplicate deliveries safely in a private inbox.

A notification is a review signal. It cannot publish an event, import participants,
grant guest access or establish a purchase or prize entitlement. Use the linked
source's explicit authorized reconciliation or purchase refresh to update evidence.
A loopback callback cannot receive a real provider delivery; live subscription
registration and delivery need separate verification.

## Purchases

Authorized event/registration managers explicitly refresh detailed purchase
observations for a source's guest. A guest-list import or invitation does not fetch
purchases. Saved observations retain immutable provider order/user ownership and
versioned evidence. Identity mismatches cause holds rather than silently attaching
financial details to a new person.

Guests read saved observations only through their own claimed portal grant, with
current event, source and feature checks. Closing new bookings can still permit an
authorized historical refund refresh; disconnecting or disabling the API source
prevents new remote reads. Failed or partial responses preserve earlier evidence.

A private text download summarizes the saved observation. It is not an invoice or
official payment receipt. The separate **Open Luma payment history** action takes
the guest to Luma, where they authenticate independently. Never invent a
participant-specific receipt URL from untrusted payloads.

Purchase summaries exclude other guests, email, provider user IDs and credentials.
They are private, uncached responses. Package prices, provider approval, email
matching, ticket counts and signed notifications do not establish financial or
prize eligibility. Native checkout, issuing refunds and automatic prize allocation
remain outside this integration.

## Development references

The existing C08/C09/C10 checks own provider scope, credentials, replay, partial
failure, durable work and guest purchase privacy. Use injected transports and the
dedicated test database; do not contact a live club's calendar during routine tests.
See [testing](../development/testing.md) and the [guest portal](guest-portal.md).

Provider contracts should be checked against the current
[Luma API documentation](https://docs.luma.com/reference/getting-started-with-your-api)
when changing an adapter. Implementation and local fixture results do not prove
that an external account has the required access or configuration.
