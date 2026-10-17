# Editing pages

Open a page or reusable section from **Website → Pages**. The same editor handles
shared headers and footers with their allowed layout blocks. Page title, address
and search metadata live in **Page settings**; text within the page remains editable
as blocks.

Choose **New page**, enter a title and select a page layout. The layout preview
uses the website renderer before anything is created; **Open full layout preview**
opens a larger view while preserving the form. A blank page starts with an empty
canvas. The address is suggested from the title; choose a custom address when
needed. **Create draft** opens private editable content.

## Organize the page tree

Choose **Website → Pages → Page tree** to browse all active pages in their saved
order. Each expanded parent loads its own pages of children, so large websites
remain manageable. **List view** keeps your previous search, filters and page.

Choose a page's **Move** button, then **Before** or **Inside, at end** beside a
destination. **Top level, at end** removes a parent; **End of current group** moves
a page after its siblings. Review the named destination and choose **Move page**.
Every step works with the keyboard. Dragging a Move handle onto a destination
chooses that same placement for review. Moves preserve URLs, menus and the current
draft and publication. An incompatible move, including a parent under its child,
is rejected.

If another editor changes the page or destination, the move keeps your choice.
Use **Refresh selected pages**, review their current location, then retry. Expanded
groups and group pagination stay in the URL. Opening an editor and using **Back to
Website** returns to that tree or filtered list. Archived pages remain available
from the list's Archived filter.

**Quick edit** changes a page's title, address, parent and order without opening
the canvas. If another editor changes the page, your input stays in the dialog.
Choose **Compare latest details**, review both versions, then **Keep my details**
or **Use latest details**. Keeping your details replaces those four fields on the
next save while retaining the latest saved blocks and other page metadata.
Another concurrent edit requires a fresh comparison. Duplicating a page also
keeps the filtered list as the editor's return destination.

## Save and recover work

The editor keeps a private recovery copy for your account after a short pause in
editing. **Recovery saved** confirms that the copy reached the server. A recovery
copy does not create a page revision or publish changes. If saving recovery fails,
your open input stays available and the editor offers retry.

Reopening the page offers **Recover my changes** or **Discard recovery copy**.
Recovery belongs to the signed-in author and page language. Another tab cannot
silently overwrite a newer recovery copy: a conflict asks you to review it.

Use **Save draft**, or Ctrl/⌘ + S, to create the saved revision that your colleagues
can review. Publication always uses that saved revision. If another editor has
saved in the meantime, **Compare changes** shows page details and added, removed,
moved or changed blocks. Choose the latest draft or keep your complete open
document for the next save. This is a whole-document choice; it does not merge
individual fields automatically. A further concurrent save requires a fresh review.

**Revision history → Compare** compares a retained revision with the current
editor. **Restore to draft** creates a new saved draft from the selected revision.
The published version stays unchanged until publication.
History shows the exact total with Previous/Next page controls, including versions
older than the first 100. Connected assistants can discover the same history with
`website_revisions_list`, then read an identified version with `website_revision_get`.

## Arrange multiple blocks

Open **List view** and choose the whole document or a particular column. Check
individual blocks or **Select all in this group**, then move, duplicate, remove,
copy or paste the selection. The selection keeps its relative order. Undo reverses
each group operation together. Copy and paste require browser clipboard access;
an unavailable clipboard displays an error without removing your blocks.

**Group** wraps 2–12 adjacent blocks in a stacked layout, preserving their order
and content. Groups use the existing content-column or shared-row controls, so
they can have a common background, spacing and responsive design. Select a group
and choose **Ungroup** to restore its blocks in reading order; group styling is
removed while individual block settings remain. Layouts cannot be nested. Select
**Whole document** and ungroup an existing layout before regrouping its contents.
Shift-select checks a range. Within List view, Ctrl/⌘ + G groups, Shift + Ctrl/⌘ + G
ungroups, and Alt + Up/Down moves the selection. Each action supports Undo.

Pages allow 80 top-level blocks, 120 total blocks and 12 per column. The editor
rejects operations that exceed those limits. Page blocks and shared header/footer
blocks cannot be pasted into incompatible documents.

**Save as section** creates a reusable section draft from the selected blocks;
your current blocks remain independent. **Add blocks → Saved sections** can insert
an independent copy or a linked section. Copies can be edited locally. Linked
sections follow their published source and must be published before a page that
uses them can be published. Sections cannot contain another linked section.
Saved sections has server-side search, exact result counts and Previous/Next page
controls. Search, page and open state remain in the editor URL when you close and
reopen the library. Loading, retry and insertion errors preserve the open draft.

## Responsive editing

Desktop, tablet and phone controls change the actual canvas viewport. Phone uses
390 pixels and tablet uses 768 pixels, so media queries and wrapping behave as
they do on a page. The surrounding administration interface keeps its own layout.

In **Design → Screen size**, choose default, tablet or phone. Responsive overrides
cover spacing, content width, alignment, supported grid columns, text size and line
spacing. Image blocks and galleries also provide fit, shape and crop-focus overrides.
The empty choice names the inherited value and its source when an override exists:
phone inherits tablet, then All screens, then the theme or block default. The reset
design button removes that screen's choices.
Existing saved designs keep their defaults until edited. Check a real phone-width
preview as well as the canvas before publication.

## Preview the whole composition

The page preview can include your open page changes without saving them. Enable
**Include saved website drafts** to combine them with the saved draft appearance,
menu, selected header/footer and referenced sections. Unsaved changes in other
editors are not included. Connected content follows its normal publication rules;
linked photo albums use their published version.

Combined previews record the reviewed site version and source revision IDs. If
one of those sources changes, refresh the preview to review the new composition.
Preview links require your authorized session and expire after 30 minutes. Forms
in previews cannot submit responses. Previewing never publishes or changes media
visibility.

Use [website publication](website-publication.md) to review saved pages and site
settings together. For reusable photographs, see [photo albums](photo-albums.md).
