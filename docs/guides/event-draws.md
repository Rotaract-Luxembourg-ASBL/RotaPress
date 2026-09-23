# Demonstration draws and approved winner names

Open **Events → open an event → Prizes → Draws & winners**. The workflow uses the
existing entry register, published prize gallery, server permissions and event
page designer.

This feature is explicitly a demonstration. Real paid entries, real prize awards
and live purchase allocation remain disabled. Use invented participants or local
fixture bookings. No payments, refunds or external provider writes occur.

## Prepare, run and share

1. In **Entries & review**, approve the demonstration records you intend to use.
   Held, voided, stale, refunded or otherwise unavailable entries are excluded.
   In **Prize gallery**, publish the prizes you want to use.
2. Choose **Prepare a draw**. Give it a name and explain its purpose/rules. Choose
   whether a participant may win more than once in this draw. Each approved entry
   has equal chance; a winning entry cannot win again within that draw.
3. Choose prize quantities, then review the included participants, entry counts
   and exclusions. **Freeze reviewed draw** saves the rules and eligibility and
   reserves the selected prize items. It does not select or publish winners.
4. Open the saved draw, then **Review & run draw**. The reviewed rules, participants
   and published prizes are checked again. The result is recorded once. Reloading
   or retrying the same draw returns that result rather than selecting again.
5. **Review names for publication** starts with empty public-name fields. Enter
   approved names or aliases only; leave a field empty to keep that winner private.
   The dialog previews exactly the names and prize titles visitors may see. Record
   a reason and approve publication. Private names are never copied automatically.
6. In **Event page → Add section**, choose **Demonstration winners**. Save and
   publish the page to place the reviewed names. The section always identifies
   its content as a demonstration with no real prize awards.

Each saved guest identity groups its purchase references as one participant.
Manual references are separate invented participants; matching names are not an
identity check. The one-prize limit applies within one draw. It is not a global
restriction across all demonstrations. These exact semantics are frozen in the
rules, rather than inferred from payment amounts or guest approval.

Draw preparation supports up to 20 prize items, 200 entry records and 50 saved
draws per event. Each entry record retains the entry register's 10,000-entry
limit. Prizes reserved by another active draw cannot be selected again.

## Changes, withdrawal and another attempt

Changing a frozen participant's decision, quantity or purchase evidence blocks a
new execution or public-name approval. Unpublishing or republishing a selected
prize also requires a new review. Newly added entries do not join an already
frozen pool. A recorded result is retained even if subsequent evidence changes.

Use **Draw actions → Withdraw public winners** to remove public names while
retaining the result and reservations. Use **Void demonstration draw** to withdraw
its public names and release reservations for another attempt. A reason is required.
The old frozen pool, result, operator and decisions remain in history. A voided
draw cannot run or publish again; prepare a new draw from the current records.

Disabling Prizes, cancelling or archiving the event stops new draws and publication.
Authorized managers can still read the history and void a draw; authorized
publishers can withdraw names. Event copies never include draws or results.
Public names also disappear when their prize revision is no longer published.
Restoring feature availability does not execute a draw or create new decisions.

## Security and implementation

Only `events.entries.manage` can prepare, execute or review draws. Public-name
approval and withdrawal also require `events.publish`. Each operation rechecks
current membership, session policy, event scope and relevant feature availability.
Entry editors, registration managers, ordinary members and guests gain no draw
administration rights. Custom API mutations retain same-origin checks and limits.

The event/organization lock serializes freezing, entry decisions, provider
observations and draw operations. Preparation keys reject stale review screens.
Frozen snapshots include schema version, rules, exact entry review versions and
evidence fingerprints, plus published prize revisions and item numbers. Each
snapshot and result has a SHA-256 fingerprint, verified when staff read it.

`draw_selection.ts` uses Node's [crypto.randomInt](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptorandomintmin-max-callback),
whose integer sampling avoids modulo bias. Selection traverses integer ticket
weights without expanding millions of entries in memory. It removes a selected
ticket, or its entire participant group when repeat winners are disallowed.
The algorithm records original ticket numbers; no browser-provided random value,
winner identity or seed is accepted by the server.

Migration `0035_event_demo_draws` adds frozen draws, one result per draw,
append-only reviews and current prize reservations. Scoped foreign keys and a
unique prize/item reservation prevent cross-event or duplicate active awards.
Runtime UPDATE/DELETE/TRUNCATE on evidence/results/reviews is denied; history
triggers also prevent rewriting. Reservations can be deleted only after a saved
void decision. Mutation, reservation and audit writes commit together.

Public reads select the separately approved projection, never private snapshots,
entry labels, payment references, reasons, operator identities or fingerprints.
The normal event visibility and Prizes checks apply. Private events still require
scope; unpublished, archived, cancelled or unavailable events produce no public
winners. Page placement and winner approval are distinct deliberate publications.

The result is an auditable local demonstration, not independent certification of
a real draw. Real rules, contribution mapping and release approval remain owner
decisions. There is no automatic winner email or notification in this stage.

## Verification ownership

C11 checks integer selection boundaries, grouping, replay/concurrency, reservations,
immutable history, stale review, changed eligibility, lifecycle, authorization,
refunded fixture purchases and the public projection. C06 rejects the winners
block in club/shared/other-module content. B01 exercises the real OTP manager,
guided preparation, saved result, reviewed names, event page placement, withdrawal
and desktop/phone layouts. See [testing](../development/testing.md) for commands and the scenario catalogue.
