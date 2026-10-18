# Website and media

Use **Website** to manage pages, menus, shared parts and appearance, and **Media**
to manage photographs, albums and files. These operations require current staff capabilities. Pending,
suspended and ordinary member accounts cannot edit or publish content.

## Pages and publication

Start with a [website template](website-kits.md) or create a page with a title
and language. A readable address is generated automatically; choose **Custom page
address** when you need a specific slug. Templates create private editable content;
previewing a catalogue example does not create records or publish anything.

Pages has server-side search, publication filters, sorting and pagination. Every
row has a selection checkbox; **Select all shown** selects the current page.
Selection can span pages, up to 100 items. Review the selection before bulk
publishing, unpublishing, archiving or restoring. A stale or invalid item rejects
the whole action and keeps your selection available to review.

**Quick edit** changes the title, address, parent page and display order. Parents
organize the library independently of public URLs and menus. Archiving a parent
moves its children to the top level; it does not archive them. Use the **Archived**
filter and **Restore from archive** to return selected items to private drafts.

Open a page in the Puck editor. The block library, List view and inspector let you
add, reorder and edit content. Use **Page settings** for title, URL and search/share
metadata. Headings in the page are separate content fields. Desktop, tablet and
phone widths render inside a real responsive canvas. See the
[editor workspace guide](page-editor.md) for recovery, multiple-block actions,
saved sections and responsive controls.
List view includes **Group** and **Ungroup** for adjacent blocks. Saved sections
has searchable, paginated results; its search and position survive reopening the
block library.

The library groups blocks into **Content**, **Layout** and **Connected**. Search
by what you need, such as an image, form or calendar; connected blocks identify
the workspace that owns their content. Expand the destination summary to change
**Insert into** and **Block position**. In a column, the before/after controls insert inside
that column. **Add a block here** at the end of the canvas adds to the whole page.

Selecting a block opens its content and design controls. The location above its
name shows its column and position; select the parent name to edit the layout.
Switching between **Page** and **Block** keeps your selected block and entered
changes. **Block settings** reopens a closed inspector. On a phone, the library
and settings open over the canvas; close them to return to the page. Escape
closes either panel and returns focus to its toolbar control. Use the arrow keys
to switch inspector tabs.

1. Edit the details and blocks, then **Save draft**.
2. Preview the saved draft with your authorized session.
3. Publish the saved revision deliberately when ready.
4. Open `/pages/<language>/<slug>` to view the published result.

Saving does not change the public snapshot. A private preview URL does not grant
another person access. Concurrent saves reject stale versions and preserve entered
content for review. The editor automatically keeps a private recovery copy for
your account after a short pause. Watch the recovery status before leaving; a
failed recovery save keeps your open input and offers retry. **Save draft** still
creates the canonical version that colleagues can review and publish.

Revision history compares an earlier version with the current editor and restores
it into a new private draft. Unpublish
removes public access while retaining content; Archive removes all languages from
normal editing and public access. Retained revisions remain immutable.
[Scheduled publication](scheduled-publication.md) targets one saved revision.

Website-level publication can review the selected pages and settings together.
[Menu-only publication](website-publication.md) updates navigation against already
published pages without publishing other saved page or branding edits.

## Blocks

The library includes text, heroes, images, galleries, PDF downloads, audio, video,
cards, buttons, FAQ, team,
partners, programme sections, forms, published events and calendar content.
The **Projects** block shows published volunteer stories and community initiatives
automatically, with an optional progress filter. Manage those stories in
[Projects](projects.md); the page and project publish separately.
Use domain-backed blocks for real forms, events, calendars and directory profiles;
manual presentation copy cannot create bookings, memberships or payment rights.

Design controls use approved spacing, width, colors, corners and alignment.
Choose a screen size to add tablet or phone overrides; phone inherits tablet,
then the default design, and the controls identify the inherited source.
New overrides affect only the block you edit. File, audio and
video blocks select compatible media; audio/video use manual playback controls
and offer transcript text. Video supports a poster image and timed captions.
Files and posters must be public before the page can be published.
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

A Form block uses a reusable form managed in **Forms**. Publish it there first, or
review and approve it in the [website publication review](website-publication.md)
to publish it together with the website. Preview fields cannot submit real responses.
Event-owned forms and participation blocks stay within their event scope.
See [forms](forms.md) and [event design](event-page-design.md).

Connected-source cards explain whether a form or reusable section has a published
version, whether a collection follows published content automatically, or whether
a feature is disabled. Source editors open in a new tab so your page draft stays
in place. Return to refresh the available choices, or use **Refresh**. Failed
loads offer **Try again** and retain saved selections; an unavailable selection
is not silently cleared. Reusable sections are offered in the page's language.

Manage event registration and Luma connections in **Events**, calendar feeds in
**Calendar**, and questions in **Forms**. Selecting a website block does not
configure a provider, publish its source, or make private records public. A source
card describes the content available to the block; it is not a live-provider
connection test.

## Photograph sections

Block **Content width** offers **Website width** for a background that reaches the
website edges. It follows the actual page or editor canvas, including phone previews.
Use the normal section or reading widths for copy inside columns.

**Story hero** keeps its existing photo and copy panel by default. Choose a tall
photo area or an overlaid panel when the story needs a larger background. Each
slide still has editable text, image, alternative text, link and focal point.

For a page introduction over a photograph, choose **Cover layout → Page banner**.
Its heading replaces the automatic page title and its responsive minimum height
keeps the photograph visible on phone screens. **Content section** keeps the
existing section heading and layout. **Photo visibility (%)** controls how strongly
the photo shows through the selected background tone; existing covers keep their
subtle photo treatment until changed. Cover **Inner spacing** applies at website
width, and **Section corners → Square** also squares the cover itself.

**Image & benefits** offers **Behind story and benefits**: its story and button appear in a
white panel, with the editable benefits beside them. On a phone, the story comes
before the benefits. **Image slider** can show one, three or four photographs;
phone layouts show one. Manual arrows and labelled controls preserve the saved
photo order, without autoplay.

In a shared footer, setting the first row's tone to **Dark** also makes the outer
footer dark. These presentation choices use normal saved blocks and publication
rules; selecting a private photograph still requires separate image review.

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

Use **Logo & icon** to choose images or a theme mark, **Colors & type** to adjust
your theme, accent and headings, and **Page layout** to find the page, header/footer
or template editor. The logo and style samples update as you edit. Switching
appearance tabs preserves entered changes. **Save settings** beside the title
keeps a private draft; its status distinguishes unsaved changes, a saved draft and
settings that match the published website. **Preview website** reviews the saved
result; **Publish website** remains a separate reviewed action. Club name and
contact details have one editor under **Settings → Club & region**.

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

Upload or select photographs, documents, audio and video through **Media** or a
block's central media picker. Each picker offers the file type its block supports.
New administration uploads default to **Public** without another publication
prompt. Choose **Private** before uploading when access should be limited to
authorized staff. Existing private images keep their visibility. REST/MCP uploads
and source imports still start private under their separate connection grants;
see [automation images](automation-media.md).

Choose **Upload files**, then browse or drop up to 100 files into the queue.
Review their previews, choose their visibility and optional collection, then
upload. The queue reports each file's result and retains unsuccessful files for
**Retry failed uploads**; successful files are not uploaded again. Choose **Done**
to return to the library. Bulk upload titles start from filenames; edit individual
details afterward. Save image metadata and visibility separately from the page draft.

The library offers grid and list views, search, file type, visibility, collection and date
filters, sorting and paged results. Searches cover the library rather than only
its first page. Open a thumbnail or its **Edit** action to review the larger image,
title, alternative text, caption, tags, collection, file details and usage. The
preview stays visible beside an independently scrolling inspector. **Details**
contains metadata and visibility; **Organize** contains collection and tags;
**Usage** lists retained/public references and paginated links to content you can
open. Previous/Next reaches every available destination; its exact total counts
destinations, while the separate reference totals include all retained revisions.
Save changes before moving to another image or closing the dialog. **Previous image**
and **Next image**, or arrow keys outside editing controls, cross filtered result
pages. Filters, view and page are kept in the URL. **Copy URL** and **Download image** make the saved file easy to
reuse. Unsaved edits are preserved until you deliberately discard them.

In **Media library**, choose **Bulk select**, then click photo thumbnails or their
checkboxes to select several files. **Select all shown** selects the current
page. Shift-click a checkbox to select a range on that page. **Clear selection** starts
again. Selection remains visible while you change filters or pages. Choose
**Make public**, **Make private**, **Edit selected** to replace tags or collection,
or **Delete permanently** for unreferenced files. A batch includes at most
**250 files**. The server checks every file's current saved state and permissions
before committing any change. A changed, unavailable or protected file rejects the entire batch; keep
the selection, use **Refresh selected files** and resolve the reported issue
before retrying.
Successful batches return the main library to browsing; **Edit** still opens an
individual image's details. **Done selecting** leaves bulk selection without
changing the library images.

In the image picker, **Media library** shows searchable thumbnails and the selected
image with its attachment details. **Insert image** or **Replace image** confirms
the selection. Switching between library and upload preserves an unfinished upload.

Use **Bulk select** inside the picker to manage several library images without
leaving the page editor. Choose images with their checkboxes, then use **Make
public**, **Make private**, **Edit selected** or **Delete permanently**. Search and
page changes keep the selected batch. These actions save library changes
immediately; they do not insert several images into a single-image field or save
the page draft. **Done selecting** returns to image insertion and retains the
image you were choosing before entering bulk selection.

In image and gallery popups, changing tabs also ends bulk selection and clears
its selected batch. Saved library changes and the image or gallery draft you
were preparing are kept. This applies to mouse and keyboard tab changes.

If another editor changes a selected image, the entire batch is rejected and your
selection is kept. In **Edit selected files**, **Refresh selected files** loads
the current saved versions while preserving the collection and tags you entered.
Review the selection and retry. Event-scoped pickers show their approved public
image collection; they do not offer uploads or library-management actions.

### Create or edit a gallery

In a **Gallery** block, choose **Create gallery** or **Edit gallery**. Select
multiple images in **Media library**, using search, filters and pages to find
them. **Select all shown** adds the current results while space remains. A gallery
contains up to **30 images**; existing image order, captions and alternative text
remain saved until you update them.

Use **Upload images** to add new photographs, or open **Edit gallery** to arrange
your selection. Drag thumbnails, or use each image's up and down arrow controls.
Select a thumbnail to edit its caption and alternative text in the inspector, or
remove it from this gallery.
These text changes belong to the block and do not overwrite the library metadata.
Event managers choose from the public image library; club media
managers maintain the uploads.

The gallery's **Media library** also has **Bulk select** for managing library
visibility, tags, collections and deletion. This management selection is separate
from the photographs included in your gallery. **Done selecting** returns to
gallery composition, preserving its order, captions and alternative text.

**Insert gallery** or **Update gallery** applies the selection to the current
block. **Save draft** keeps the page changes; page publication remains separate.
Canceling can discard unfinished gallery changes. Images already uploaded remain
in the Media library, including uploads beyond the gallery's 30-image limit.

Choose grid, masonry or manual slider presentation, image fit and optional lightbox controls in
the Gallery block. Lightboxes support keyboard navigation, focus return and touch
swipes. Existing galleries keep their previous layout until changed. For a gallery
that is reused and updated across pages, create a [photo album](photo-albums.md).

### Edit a photograph

Open image details and choose **Edit image**. Resize the crop with its corner
handles, drag the selection to move it, or enter exact crop coordinates. Arrow
keys adjust a focused handle or selection one pixel; Shift adjusts ten pixels.
Choose an aspect ratio to lock the crop or zoom the preview for detail. Rotate, flip and reduce the image width;
the edited preview shows the result before saving. **Undo image edit**,
**Redo image edit** and **Reset edits** work on the unfinished changes.

**Save edited copy** creates a separate image in the library with the source's
metadata and visibility. The original image and its existing placements remain
available. Select the new copy wherever you want to use it. Cancel or return to
details to keep using the original. File edits do not replace photographs on
published pages automatically.

Image fields accept single-frame PNG, JPEG or WebP, up to 5 MiB and 20 million
pixels. The library also supports PDF, MP3/M4A and MP4/WebM with resumable uploads.
See [files, uploads and recovery](media-files.md) for exact formats, limits,
pause/resume behavior and delivery. SVG, GIF, HTML and archives are not accepted.

A private image can appear in an authorized draft preview. A public image's media
URL is accessible to anyone, including when no current page places it. Making an
image private cannot recall copies already downloaded. Publishing page content
never changes an image's visibility automatically.

Published references prevent making a live image private. References in any retained
revision prevent deletion, preserving restoration. Remove public placements and
republish before changing visibility. Only an unreferenced image can be deleted;
**Delete permanently** has no trash or undo.

## Storage and recovery

Uploaded files live outside the public web root in `.data/uploads`; PostgreSQL holds
metadata and references. The Docker hosting recipe keeps that directory on a
persistent volume. Storage keys are opaque, and path or symlink escapes are
rejected. The normalized image is retained, not a second copy of the original upload.

A recoverable installation needs the database, actual files and separately protected
secrets. The [hosting guide](hosting.md#updates-and-backups) explains how to back up
and restore the Docker installation. Keep complete backups in a protected location
away from the application server and test recovery before relying on them. Object
storage is not supported; do not deploy uploads on an ephemeral filesystem.
