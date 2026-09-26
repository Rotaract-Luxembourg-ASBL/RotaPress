# RotaPress product UX rules

These rules apply to administration, member tools and the workflows connecting
them to the public website. A person without CRM, WordPress or technical experience
should be able to understand what to do, what happened and what to do next.

Use [architecture](architecture.md) for system boundaries and
[the roadmap](roadmap.md) for unfinished release work.
The associated [product UX skill](../../skills/rotapress-product-ux/SKILL.md) explains
how to apply and verify these rules.

## 1. Organize around the person's task

Name workspaces after recognizable things: Events, Forms, Members, Website,
Response center and Settings. Keep the related work together. A volunteer should
not need to learn where a feature's database record happens to be stored.

| Task                                    | Expected home                                                          | Avoid                                                             |
| --------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Design the built-in `/events` directory | Events → Directory design                                              | Selecting another CMS page through Website menus as the only path |
| Design an individual event              | Event → Event page → Sections, live preview and layouts                | Opening a second competing event workspace                        |
| Connect event sponsors or people        | Event page → Partners, Sponsors or Team → Published directory profiles | Copying directory records into unrelated event-only lists         |
| Create a form                           | Forms → New form → Choose a template → Edit                            | A permanent creation form squeezed beside the list                |
| Change a question                       | Form → Build → Select a question                                       | Expanding every question's settings at once                       |
| Review a form's responses               | Form → Responses → Results for that form                               | Opening all responses and asking the user to filter again         |
| Remove an old form                      | Archive → Archived → Review permanent deletion                         | An ambiguous Remove button or no way to finish deletion           |
| Try conditional questions               | Form → Preview                                                         | Guessing how rules will behave from configuration alone           |
| Put a form on the website               | Form → Share → Add to a website page                                   | Copying internal IDs or requiring manual block wiring             |
| Read received answers                   | Response center, with the form filter already selected                 | Separate disconnected inboxes for each entry point                |
| Change club branding                    | One canonical appearance workspace                                     | Competing branding controls in multiple panels                    |

Provide a direct contextual link when a related task belongs elsewhere. Keep the
current form or event selected when opening its responses. Back navigation must
return to the relevant collection or event, not an unrelated home screen.

## 2. Make the main action obvious

A page has a clear title, a short purpose when useful and one visually dominant
next action. Lists normally use New form or New event. Editors make Save draft
and Publish understandable, with the current save state nearby.

Common row actions such as Edit remain visible. Secondary actions use a consistent
compact overflow menu with a descriptive accessible name. Its menu opens above
surrounding content, closes on Escape or outside interaction, and works with a
keyboard. Icons may support labels; familiar overflow icons need an accessible
label and tooltip. Do not enlarge label text through unrelated global CSS rules.

Use the same verb for the same operation everywhere. Prefer explicit labels such
as Add question, View responses and Publish form over generic Manage or Actions
where the destination can be named. Never show a primary Remove button beside
every item. Distinguish archival from permanent deletion and explain recoverability.

## 3. Keep screens focused

Show common controls first. Group advanced controls by purpose, with a useful
summary when configured. Avoid putting creation, editing, preview, notification
settings, retention and sharing in one long competing column of controls.

Use tabs for independent areas of one object. Use stages when later choices depend
on earlier ones. Use a modal for a bounded creation or review task, with a clear
title, close action, sensible focus and persistent entered values while moving
between stages. Do not force a wizard onto a single simple edit.

Question editors should show the selected question and preserve a readable outline
of the whole form. Ordering, duplication and rules must remain discoverable.
Selecting another question or previewing must not erase unsaved work.

## 4. Creation starts with useful choices

Offer templates described by their purpose and actual included questions. A preview
should help someone decide before creating anything. Explain special consequences
where relevant: a membership application needs identity verification and human
approval; an RSVP enquiry does not reserve an event place.

Create private drafts by default. Open the created item immediately with a clear
next step. Canceling before creation must not leave a hidden saved object. Never
fabricate submissions, attendance, payments or success metrics to fill a dashboard.

## 5. Explain saved, published and operational states

Someone editing must be able to tell:

- whether their current changes are saved;
- what visitors currently see;
- which action will change the public version;
- whether the form or event is accepting participation.

Keep revisions and immutable snapshots internally. Use plain status text in the
main flow. Public preview and draft preview must be distinguishable. Use the same
renderer where practical so previews represent real output. Preview answers are
never submissions. Draft saves must not publish unrelated website settings.

Publication controls explain missing requirements with a path to resolve them.
Avoid a disabled button that gives no explanation, including on touch screens.
Protect against concurrent overwrites and retain entered data when a save fails.

## 6. Keep settings in one place

Each setting has one canonical editor. Related screens can summarize it and link
there. Do not add another control simply because the underlying API accepts it.
Built-in page design, website navigation, public branding and authentication are
different tasks; the interface should make their relationship clear.

Do not expose database IDs, internal feature flags, callback mechanics or server
terminology unless the person is deliberately configuring an advanced integration.
At that point provide examples and relevant constraints beside the field.

## 7. Errors and confirmations help people recover

Errors identify the affected field or task, explain the issue plainly and give a
next action. Preserve the person's work. Loading must resolve to content or a
recoverable error, not an indefinite spinner after a failed request.

Routine reversible edits should proceed without extra confirmation. Archive,
destructive changes and consequential publication reviews state exactly what
changes, whether records are retained and whether undo is available. Reserve
reauthentication for sensitive credential, account and permission changes.

Server authorization remains mandatory. Friendly UX must never turn authentication
into membership approval, expose private responses, or make a hidden button the
only security boundary. Show only the tools that the current role can use.

## 8. Visual consistency and accessibility

Use the shared typography, spacing, buttons, dialogs, status badges and action menus.
Administration stays readable regardless of public website branding. Prefer clear
hierarchy and whitespace to large decorative headlines in operational screens.

Check keyboard operation, visible focus, field labels, current-tab indication,
semantic headings, contrast and adequately sized touch targets. Status needs text,
not color alone. Tabs wrap or scroll deliberately on a small screen; action rows
must not push the page sideways. Dialogs and editors must work at phone widths.
Never solve overflow by hiding essential controls or shrinking text until unreadable.

Main administration collections use the [shared workspace pattern](admin-workspaces.md):
heading and primary action, workspace sections where needed, real count cards,
counted filters, search, labeled rows and a result total. Reuse `src/ui/collection.tsx`
instead of another feature-specific dashboard/list/status implementation. Settings
and editors may use different task layouts with the same heading, navigation,
buttons and status language. Counts must state their scope: published details,
public visibility and repeated occurrences describe different things.

## 9. Acceptance for an interface change

Use a short task walkthrough with real local records and a real authorized session:

1. Find the task from the main navigation without repository knowledge.
2. Complete creation or editing using visible labels.
3. Move between relevant areas and confirm entered work is preserved.
4. Save, reload and confirm persistence. Verify the draft/public boundary when affected.
5. Exercise an empty or error state and the affected permission boundary.
6. Check the same flow on desktop and phone, including menus and dialogs.

Extend the existing principal browser journeys when behavior changes. Test new
authorization, publication or data risks at their owning layer. Do not add a test
for every cosmetic change. Inspect screenshots, but also verify actions and saved
results. Record commands, outcomes and limitations in the pull request or local handover.

Developer and automated walkthroughs cannot establish that inexperienced people
find the product understandable. Use participant feedback to assess comprehension
and simplify the workflow.
