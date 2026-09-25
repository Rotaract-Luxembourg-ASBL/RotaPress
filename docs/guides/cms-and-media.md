# Website and media

Use **Website** to manage pages, menus, shared parts and appearance, and **Media**
to manage images. These operations require current staff capabilities. Pending,
suspended and ordinary member accounts cannot edit or publish content.

## Pages and publication

Start with a [website template](website-kits.md) or create a page with a title,
language and readable URL slug. Templates create private editable content;
previewing a catalogue example does not create records or publish anything.

Open a page in the Puck editor. The block library, List view and inspector let you
add, reorder and edit content. Use **Page settings** for title, URL and search/share
metadata. Headings in the page are separate content fields. Desktop, tablet and
phone preview widths help review the result.

1. Edit the details and blocks, then **Save draft**.
2. Preview the saved draft with your authorized session.
3. Publish the saved revision deliberately when ready.
4. Open `/pages/<language>/<slug>` to view the published result.

Saving does not change the public snapshot. A private preview URL does not grant
another person access. Concurrent saves reject stale versions and preserve entered
content for review. Unsaved editor input is not a durable draft; save before leaving.

Revision history restores an earlier version into a new private draft. Unpublish
removes public access while retaining content; Archive removes all languages from
normal editing and public access. Retained revisions remain immutable.
[Scheduled publication](scheduled-publication.md) targets one saved revision.

Website-level publication can review the selected pages and settings together.
[Menu-only publication](website-publication.md) updates navigation against already
published pages without publishing other saved page or branding edits.

## Blocks

The library includes text, heroes, images, galleries, cards, buttons, FAQ, team,
partners, programme sections, forms, published events and calendar content.
Use domain-backed blocks for real forms, events, calendars and directory profiles;
manual presentation copy cannot create bookings, memberships or payment rights.

Design controls use approved spacing, width, colors, corners and alignment.
Images support alternative text, captions, aspect ratio, fitting, focal position
and sizing. Presentation edits do not rewrite the stored image. Sliders use manual
controls rather than automatic movement.

Rich text is sanitized on the server. Scripts cannot execute in ordinary text
blocks or uploads. Unknown block versions are rejected. Publication also checks
current scope, media visibility, referenced forms and feature availability.

**Club details** displays selected public information from **Settings → Club &
region**, including district/club numbers, location, contact details, charter date,
sponsoring club, meetings and Polaris. Choose a list or columns and hide labels
when appropriate. Empty values are omitted. It works in pages and shared parts;
updating saved club identity updates connected blocks immediately. This is public
information, never private membership records. A Polaris link opens the existing
portal and does not import or authenticate members.

**Custom HTML / JS** accepts bounded HTML, CSS and JavaScript inside an isolated
frame with its own height and accessible title. It can run a self-contained widget,
but cannot access the surrounding page, cookies, club APIs or editor. External
scripts, images other than embedded data images, network requests and form
submissions are blocked. Use normal CMS blocks for club media, forms and connected
data. Draft code runs only after **Run code preview**; public execution requires
deliberate page publication. Stop preview to discard its runtime state.

Browser, search and social titles include the club name, for example **Home | Club
name**. The page editor shows the resulting search title; do not repeat the club
name in every page title. Existing recognized club suffixes are not duplicated.
Website Search & sharing can override the homepage's title and description;
changes to page/site drafts still require publication.

A Form block uses a reusable form managed in **Forms**. Publish the form before
publishing a page that uses it. Preview fields cannot submit real responses.
Event-owned forms and participation blocks stay within their event scope.
See [forms](forms.md) and [event design](event-page-design.md).

## Languages and reusable sections

English, French and Luxembourgish content variants are authored and published
separately. RotaPress does not fabricate translations or expose a different
language's private draft as a fallback.

Reusable sections have their own drafts and publications. A page references the
section's published version in the same language. Editing the section draft changes
no public page; publication shows its affected placements. Nested reusable sections
are not supported. Remove published references before unpublishing a used section.

## Shared site parts

**Header & footer** edits shared parts through the same CMS and revision workflow.
Pages inherit their published language-specific parts. **Menus** owns the homepage,
Events landing selection and navigation references. Unavailable targets do not
become public merely because a menu references them.

**Branding & appearance** owns the shared logo, browser icon, alternative text,
club-name visibility and appearance. Draft settings remain private. Public forms,
sign-in and account entry surfaces use published identity; member and administration
workspaces retain their application layout. Independent event pages keep their
own appearance.

A template switch preserves existing custom content and explicit branding. It does
not change membership, provider credentials, feature activation or image visibility.
See [website publication](website-publication.md) for blocking-image review.

## Shared content

The community directory stores managed profiles such as partners, sponsors and
team entries. Edit and publish profiles in their own workspace, then select them
in a page or choose an automatic category. Shared profile drafts remain private;
publication updates their selected placements. Publishing a profile does not
expose private member records automatically.

Calendar and event blocks use their owning feature's published, audience-aware
projections. A calendar schedule, recurring occurrence and event registration are
different records; embedding a block does not copy or authorize them.

## Media

Upload or select images through Media or a block's central image picker. Uploads
start **Private**. Save metadata and visibility separately from the page draft.
Accepted files are single-frame PNG, JPEG or WebP, up to 5 MiB and 20 million pixels.
The server checks signatures, decodes and reencodes images as WebP, and strips
unnecessary metadata. SVG, GIF, HTML, archives and PDF are not accepted uploads.

A private image can appear in an authorized draft preview. Before publication,
choose **Public** only if anyone should be able to retrieve its media URL, including
when no current page places it. Publication never changes visibility automatically.

Published references prevent making a live image private. References in any retained
revision prevent deletion, preserving restoration. Remove public placements and
republish before changing visibility. Only an unreferenced image can be deleted.

## Storage and recovery

Developer image bytes live in ignored `.data/uploads`; PostgreSQL holds metadata
and references. Storage keys are opaque and traversal/symlink escapes are rejected.
Test uploads use a separate local location. The normalized image is retained,
not a second copy of the original upload.

A recoverable installation needs the database, actual files and separately protected
secrets. Preserved local files and Docker volumes do not prove disaster recovery.
Full backup/restore and object storage remain open [roadmap](../development/roadmap.md)
work. See [local development](../development/local-development.md).
