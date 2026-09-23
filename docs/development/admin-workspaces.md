# Administration workspaces

The main administration panels share a collection layout. Use it for Forms,
Events, Calendar activities, Community directory, Members and website content.
Media retains image thumbnails; Response center retains its message/detail view.
Settings and Website use the same section navigation as the Calendar selector.

The [administration header and account menu](../guides/member-portal.md#staff-access) share published
club branding with the member portal and link to the existing personal profile.
Club membership and staff permissions remain separate.

## Finding and managing records

1. Read the page title and use its primary creation action when adding a record.
2. Use workspace sections for different tasks, such as Events > Directory design.
3. Read the count cards. Selecting an interactive card changes the list's status
   or date filter. Search and other selected filters still apply.
4. Narrow the list with counted status/category buttons, search and selectors.
   Clear filters recovers an empty search. The footer states how many records are shown.
5. Open or edit a record with its visible action. Related tasks, such as Responses
   or Design page, remain beside it. Lifecycle actions use the labeled three-dot menu.

Event removal is called **Archive event** throughout. Its review explains that
records are retained and event restoration is not currently supported. Form and
Calendar restoration retain their existing behavior. This interface change does
not add a deletion or restore endpoint.

Calendar publication is in each activity's action menu. The parent calendar and
activity publish separately. An activity in an unpublished calendar says so;
publishing the activity alone does not expose that calendar. Activity editing
keeps the staged date/repeat review and searchable time zone picker. Cancel,
Escape and the close button all protect unsaved activity edits.

## What the numbers mean

All counts come from existing authorized API results. There are no sample growth,
attendance, revenue or engagement figures. Collection counts describe the loaded
records within the current account's scope; they are not a new analytics service.
Search affects the shown-row total, while status/category counts describe the
underlying collection. API authorization and public projections remain unchanged.

| Workspace | Meaning |
| --- | --- |
| Forms | Active excludes archived. Published means a published form version exists; edits may still be private. |
| Events | Active includes retained cancellations. Upcoming excludes cancelled/archived events and uses saved start dates. Details published does not promise a live public event page. |
| Calendar | Calendar counts cover managed calendars. Activities count saved schedules once, including repeating schedules. Connected Events appear in Combined calendar, not as duplicate activity records. |
| Community directory | Counts follow the selected category. Published profiles can be selected in blocks. Placement counts describe existing published placements. Unpublished changes are saved edits to a published profile. |
| Members | Approved, pending and inactive memberships are separate from staff roles. Access changes retain the existing authorized review. |
| Website | Counts follow the selected collection and language. Published includes pages with unpublished edits. |
| Media | Public/private counts reflect asset visibility; uploading still starts private. |
| Response center | Counts cover all matching result pages, including form, status, search and date filters. People are grouped only from the current result page. |
| Integrations | Enabled/disabled counts describe built-in features, not successful provider delivery or live-provider verification. |

Overview presents Forms, Events, Calendar, Website, Members and Response center
only when the user has the corresponding capability and the feature is available.
Failed or loading reads show an error/retry or loading state rather than a zero.
Shortcuts point to each setting's existing owner.

## Contributor pattern

Use `src/ui/collection.tsx` for `SummaryStats`, `FilterTabs`, `CollectionToolbar`,
`Collection`, `CollectionRow`, `CollectionEmpty` and `StatusBadge`. Use `PageHeading`
and `ActionsMenu` for headings and secondary actions. `admin-workspaces.css` owns
collection appearance and container-width adaptation; `admin-sections.css` owns
section navigation. Public template styling stays separate.

Keep filtering and permissions in their owning feature. Shared components only
present supplied values and callbacks. Do not add a generic repository or duplicate
a service to populate a count. At smaller widths, rows become labeled cards,
filters wrap, and actions stay visible. Check menu placement and focus return.

Follow [product UX rules](product-ux.md). Changed labels need updated B01/B02
selectors. Existing journeys cover publication, persistence, archive/delete and
authorization. `admin-collections-journey.ts` adds count/filter recovery, category
filtering, editor return and phone menus. An agent walkthrough is not a participant study.
