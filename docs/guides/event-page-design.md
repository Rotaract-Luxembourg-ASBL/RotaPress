# Designing an event

Open **Events → Open event → Event page**. The page designer is part of the
event workspace. Details, packages, participation, guests and prizes stay in
the same workspace; changing panels preserves entered page content.

Choose your own public artwork through the existing image picker.

## Start with a layout

When creating a page, use **Browse 10 layouts**. For an existing page, use
**Choose a layout**. Each choice is an editable composition:

| Layout | Starting design |
| --- | --- |
| Rotaract signature | Gold and cream, centred full-height introduction, programme and impact |
| Gala evening | Classic typography, generous spacing, story and sponsor section |
| Conference & talks | Blue, split introduction, agenda and speaker/team profiles |
| Community mixer | Berry, compact left introduction, practical details and people |
| Community action | Green, split introduction, project impact and volunteer information |
| Hands-on workshop | Amber, compact learning story, programme and facilitators |
| Community festival | Orange, full-height invitation, gallery and programme |
| Purpose & impact | Wine, classic split introduction, project story and sponsors |
| Move together | Teal, bold left introduction, schedule and participant information |
| Anniversary & celebration | Violet, classic centred introduction, story, gallery and team |

Example text is editable guidance, not an assertion about an actual event. Images,
people, bookings and donation totals are never invented. New directory sections
start with no selected profiles. No layout enables an event feature or publishes
anything automatically.

Changing layouts keeps existing text, images and connected forms/profiles. It
reorders matching sections, adds missing example sections and changes appearance.
Older generic hero sections are hidden but retained when the event introduction
is added. **Undo layout change** restores the preceding document until the next
content edit. Saved revision history remains available through existing services.

## Edit, arrange and preview

- **Content** shows named page sections, the selected section's controls and a
  live private preview. Add sections from the searchable library. Move them with
  the arrows, hide them with **Show…**, or use **Section actions** to duplicate or
  remove them. Removed sections have an immediate Undo option.
- **Page layout** shows the complete order and visibility without opening every
  section. Hidden content stays in saved revisions and is omitted from both the
  visitor page and its section navigation.
- **Theme & appearance** controls page style, palette/custom colours, type,
  spacing, corners, width and section navigation. Public event design is
  independent of administration and club website branding.
- **Page settings** contains sharing/search text and image, the standalone
  address and the event subdomain setup link.
- **Preview changes** opens the same authorized preview at desktop or phone
  size. It uses the normal public renderer with the saved event details and
  current page input. Temporary previews are private, session-bound snapshots;
  they are not published CMS revisions. Closing preview keeps the editor intact.

The introduction and practical information use the event's canonical name,
description, date and venue from **Event details**. They do not maintain another
independently editable copy. The countdown hides after the start. Calendar export
uses those same dates. Its action is disabled in private previews.

## Connect real content

**Partners**, **Sponsors** and **Team** in the section library use the community
directory. Choose particular published profiles in display order, or choose
**Automatic category**. Category sections refresh from published directory
content; drafts/private profiles stay excluded. Inline legacy Team content remains
readable, but these connected sections are the primary entry point.

**Form** selects a published form belonging to this event. **Event registration**
uses this event's registration settings. Enable and configure them in
**Participation** or **Event features** before placing them. **Packages** and
**Prizes** similarly read their existing published collections. Removing a page
section never deletes its underlying form, sponsor, package, prize or response.
**Demonstration winners** displays only the names explicitly approved under
**Prizes → Draws & winners**; it never displays the private entry register.

## Save and share

**Save draft** keeps the public page unchanged. **Publish changes** reviews the
saved event details and the current page, saves the page draft if needed, and
publishes the exact reviewed versions using the existing atomic publication flow.
Other page drafts stay private. **Page languages & availability** owns language
variants, optional separate gallery/sponsor pages, retained feature states and
unpublication.

Public events appear in `/events` and in a club page's **Published events** block
when the event and its website are published in that language. The standalone
address is `/events/<event-slug>/<language>/website`. Unlisted events are available
by link but absent from the directory. Private events still require scoped access.

For an optional event subdomain, the owner uses **Settings → Domains** and
selects **An individual event**. Setup retains the event destination and provides
a DNS ownership challenge. An event manager cannot change domain ownership.
Actual hosting is pending: configure HTTPS and an external redirect from that
subdomain to the displayed event URL when a domain is chosen. Verification does
not enable host routing, broaden CORS, share cookies or change Google callbacks.
Keeping the subdomain in the browser address bar is not implemented by this setup.

## Implementation and checks

`event_layouts.ts` owns ten stable catalogue entries; `event_layout_recipes.ts`
composes/merges existing CMS blocks. `event-reference-config.tsx` registers the
four new event sections. `event-reference-blocks.tsx`, `event_sections.ts` and
`event-reference.css` render them through the shared public renderer. CMS
publication and media reference validation include introduction artwork.

The canonical editor route is `/admin/events/<id>?tab=website&page=<page>&locale=en`.
Older `/admin/events/<id>/page/<page>` links redirect there. C06 checks layout
round trips, preserved content, event-only scope, private preview/publication and
artwork protection. C02 checks event-domain ownership and destination constraints.
B01 covers the real OTP editor/publication flow and the layout gallery; B02
continues to cover the shared CMS. See [testing](../development/testing.md) for the check commands.
