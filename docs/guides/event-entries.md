# Event entry register and review

The private demonstration register is under **Events → open an event →
Prizes → Entries & review**. Enable Prizes in Event features first. The gallery
and its publication workflow remain separate. See [Events](events.md) for the
surrounding workflow and current limitations.

## Add and review entries

1. Choose **Add demonstration entries**. Start with an invented test participant,
   or select a saved test booking and its payment reference. Test bookings require
   purchase details previously refreshed through the local provider fixture.
   A normal installation can practice with test participants without Luma setup.
2. Enter the number of entries and a reason. The manager chooses the number;
   ticket counts, amounts, discounts and guest approval never assign it automatically.
   Use a unique reference for a manual participant. Each saved purchase reference
   can have only one entry record for its retained guest owner.
3. The register shows actual saved counts, searchable participants/references and
   filters for ready, held and voided records. Counts are numbers of entries,
   not payments or people. **Refresh entries** rereads saved local evidence; it
   does not contact a provider.
4. Choose **Review** to see the saved payment, hold reason and decision history.
   Choose **Approve for demonstration**, **Put on hold** or **Void entries**,
   explain the decision and save. An approval or hold can revise the count while
   retaining earlier quantities and reasons. Voiding permanently excludes that
   record and preserves its history; it cannot be reapproved or deleted.

The panel retains its selected tab on reload. Switching between the gallery and
entry review preserves an unsaved prize draft. Dialogs preserve input when a save
fails, warn before discarding changes, and return focus to their trigger.

## Purchase evidence and holds

Only local fixture purchases can be allocated in this slice. Live provider
purchases are rejected by the server, and no payment processor, purchase, refund,
admission right or real prize award is created. Manual entries are explicitly
marked demonstration records. The API and database permit only demonstration mode.

The purchase service supplies a narrow private projection; the entry service
does not parse webhook bodies or make provider requests. It reuses the retained
guest/provider identity and order ownership from [purchase observations](luma.md#purchases).
Every approval records the exact saved observation and a digest of its current
state and selected order. Amounts are displayed using the currency's minor units.

An entry is effectively on hold when saved evidence is changed, stale, missing,
failed or running; when the booking is no longer approved/present; when payment
is uncaptured; or when any partial/full refund is recorded. Disabling a source,
API connection or registration feature makes that purchase evidence unavailable.
Identity changes hide the earlier order details and prevent approval. A failed
refresh does not replace the earlier successful observation or decision history.

To reconcile, refresh the booking's **Purchase details** in **Registration & forms**,
return to the register and review the new saved evidence. Even a successful refresh
with unchanged amounts produces a new observation requiring deliberate approval.
A refund hold cannot be overridden by a staff note: keep it held or void it.
This conservative demonstration does not implement partial-refund entitlement rules.

Holds are calculated from saved observations on each read and before each decision.
The register does not poll Luma or imply that an old saved observation describes
current external payment status. Earlier observations and review records retain
the evidence; there is no separate mutable eligibility flag or background draw.
The [demonstration draw](event-draws.md) freezes these reviewed records before selection.

## Authority, history and limits

Only the current event manager and authorized club administrators have
`events.entries.manage`. Assigned editors can still prepare prize gallery content,
but cannot read these records; registration managers and ordinary guests also
receive no entry-register authority. Requests recheck current membership, staff
sign-in policy, organization/event scope and feature lifecycle on the server.
Private responses use `Cache-Control: no-store`. No entry, payment reference,
quantity, explanation or decision history is exposed by public gallery routes.

Migration `0033_event_entry_register` introduces immutable entry identities and
append-only reviews, with scoped event, guest and observation foreign keys.
Database constraints enforce demonstration mode, reference uniqueness and bounded
positive quantities. The runtime role cannot update, delete or truncate these
tables, and history triggers also reject updates/deletes. Successful decisions
add a minimal identifier-only audit event in the same transaction.

Organization locks serialize decisions with membership, event, connection and
provider observation changes. A client request ID replays only the identical
actor/event/operation/payload; a changed payload conflicts. Concurrent decisions
must match both the latest decision version and purchase-evidence digest.
Voided records remain unavailable even if subsequent payment observations change.

The demonstration is limited to 200 participant/payment-reference records per
event and 1–10,000 entries per record. It is not an unbounded production ledger.
Disabling Prizes, cancelling or archiving the event retains readable records for
authorized managers while stopping allocation and review mutations. Event copies
do not copy entry identities, payment references or operational history.

## Draws and publication

**Draws & winners** records explicit demonstration rules, freezes the reviewed
entry set, selects once with replay protection and keeps the result in history.
Only deliberately approved public names can appear in the event page's winners
section. Follow [draw operation](event-draws.md) for the complete workflow.
Real paid activation and real draws still need owner rules and release approval.
