# Projects

Use **Projects** to showcase volunteer actions, ongoing initiatives and completed
community work. A one-day cleanup and a year-long partnership can use the same
simple story format. Use **Events** for bookings and registration, and **Calendar**
for schedules and recurring activities.

## Add your first project

1. Open **Projects → New project**, enter a title and short summary, then choose
   **Create draft**.
2. Add the story: what you are doing, why it matters and who it helps.
3. Choose **Planned**, **In progress** or **Completed**. Dates, location, a cover
   image, outcomes and a link for visitors are optional.
4. **Save draft**, then **Preview project** to review the story.
5. **Publish saved draft** when the saved content is ready for everyone to see.

New projects are private. A summary is required before publication. Use the
optional outcomes field for results you can substantiate; RotaPress does not
calculate or invent volunteer hours, beneficiary counts or donations.

Uploaded images start private. Before publishing a project with a cover, make
that image public deliberately in **Media**. Publication explains missing
requirements and keeps your saved draft intact.

## Keep stories up to date

Progress describes the work, while publication describes what visitors can see.
A project can be planned and published, or completed and still a private draft.
Saving edits to an existing publication leaves the public version in place until
you publish the saved changes. The editor identifies unsaved changes and saved
unpublished changes separately. Concurrent edits reject stale saves. Returning
through browser history can recover unsaved edits in the same tab. Save before
refreshing, closing the tab or signing out; preview and navigation do not save a
draft.

**Unpublish project** hides the story and keeps its draft. **Archive project** hides it
and moves it to the Archived list. **Restore project** returns it as a private
draft for review; it does not republish. Permanent deletion is not part of this
workflow.

Content editors can create and edit projects. Publishing, unpublishing and
archiving a published story require website publication permission. Ordinary
members and event-only editors cannot edit club projects.

## Show projects on the website

Published projects appear in **/projects**, with search and progress filters.
Each story gets a stable link that continues to work when its title changes.
The directory and stories use published club branding and website menus.

In the website page editor, add the **Projects** block. Choose a heading such as
**Our impact**, a progress filter and the maximum number of cards. Save and
publish that page separately. The block automatically shows matching published
projects, so you do not need to copy stories or rebuild cards after every update.
An empty collection is hidden on public pages. Under **Website → Menus**, add
a menu link and choose **Projects (/projects)** as its destination, then publish
the menu deliberately.

Projects has one story per project, with English interface labels. Separate
language variants, volunteer sign-ups, attendance tracking, donations and
automatic impact calculations are outside this first version. The optional
visitor link can lead to an existing form, event or external page; it does not
create or publish the linked content.

## Availability and connected assistants

Administrators can disable Projects in **Integrations**. This pauses its private
operations, public directory, stories and website blocks while preserving saved
records. Re-enabling restores the previously published stories.

REST and MCP use shared scoped actions for reading projects and preparing private
drafts. Publication needs a separate **projects:publish** grant, explicit user
instruction and the exact saved version. Assistants cannot archive or unpublish
projects through these actions. Existing connections do not gain new permissions
automatically. See [AI & API](ai-and-api.md).
