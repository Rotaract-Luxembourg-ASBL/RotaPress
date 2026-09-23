# Calendar

Calendar brings schedules and published events together. Manage it in
**Administration → Calendar** (`/admin/calendar`). Visitors and signed-in people
use `/calendar`; approved members also see calendars intended for members.

## Start with a calendar

1. Choose **New calendar**. In **Details**, give it a clear name, optional description
   and a named color. Use **Continue** to move through the setup.
2. In **Audience & time**, choose everyone or approved members, then search for a
   city or region in the time-zone picker. Opening it shows the full supported list,
   not just the current zone. Arrow keys and Enter select; Escape keeps the old value.
3. In **Connected events**, optionally include all public events or choose specific events.
   Those events keep their own dates, pages and publication controls in Events.
4. Review the summary, choose **Create calendar**, then **Publish calendar** when ready.
5. Choose **Add activity**, enter details, choose dates and repeats, then review.
   Saving keeps the schedule private; **Publish activity** makes it visible.

Calendar settings and schedules publish separately. Saving an edit does not
replace its published version. Archive and unpublish remove content from views;
restore retains the saved draft and requires publication again. Lifecycle actions
are in labeled overflow menus, alongside visible edit controls.

Use **Edit calendar** to open the same three sections. Save from any section;
the workspace labels saved changes that still need publication. Cancel, close and
Escape protect unsaved edits. Changing the default time zone affects new activities
only; existing activities retain their own zones and times. Activities, imports,
page design, public views and Calendar blocks share the searchable time-zone picker.

Schedules support single dates, daily/weekly/monthly repeats, intervals, multiple
weekdays, an optional end date, skipped dates, all-day activities and cancellation.
Edit a repeating schedule to change the series; use **Dates to skip** for an
exception. To move one occurrence, skip its original date and add a one-time activity.

Repeats keep their local start time across daylight saving changes. Missing clock
times move forward; overlapping clock times use the first occurrence. A monthly
date missing from a month is skipped. All-day activities retain their calendar
dates when viewers change display time zones. Date ranges use an exclusive end.

## Combine calendars and design the page

**Combined calendar** previews the currently published activities available to
your account. Month, week and agenda views share calendar filters, search and a
display time zone. Select an activity for its details and optional event link.
The same event included by two calendars appears once with both calendar names.

Use **Page design** for the built-in `/calendar` page: title, introduction,
starting view, display time zone and selected calendars. Save, then publish the
page design. Unchecked calendar selections mean all calendars the visitor may see.
The page uses the website's shared branding, header and footer.

In **Website → Pages**, add the **Calendar** block. Choose calendars, view and
time zone in its controls. The same block is available in an event page. Its
picker uses accessible published calendar names; private schedules are checked
again by the server for every viewer. Add **Calendar** as a built-in destination
in Website menus to link to the dedicated page.

## Import files and connect feeds

Open a calendar, then **Imports & sync → Import or connect**.

- **Upload a calendar file** imports an iCalendar `.ics` export. Name the import,
  select the fallback time zone, review the preview, then save the import draft.
- **Review import → Publish imported activities** publishes that saved import.
  The calendar itself must also be published before visitors can see it.
- **Connect an HTTPS calendar feed** adds a one-way connection. A current staff
  identity with integration permission is required. The full URL is encrypted
  because subscription links may contain access keys; lists show only the host.
- Updates normally remain drafts for review. At connection creation, an explicit
  option can publish future updates automatically after the first manual publication.
- **Refresh now** reads the source immediately. The existing local job loop also
  checks due connections hourly. It needs a current authorized staff session.
  **Resume sync** renews that authority after expiry or Calendar being disabled.
- **Pause and hide import** stops refreshes and removes its activities from views.
  **Remove import** deletes only that import and its activities; manual schedules remain.

Change imported activities in their original calendar. File uploads are a saved
copy, not a live connection. Reimport a replacement file under a new import and
remove the old copy after review. A connected source replaces only its own
projection; UID-based occurrence identities remain stable through refreshes.
Deleting an activity upstream removes it after the next published source update.
A failed or invalid refresh retains the last good saved and published content.

An `.ics` export or HTTPS subscription link can come from Google Calendar,
Outlook, Apple Calendar or another compatible tool. This does not connect a Google
account or grant provider API permissions. Google sign-in remains a separate
Better Auth integration. OAuth calendar APIs, two-way updates, CalDAV and CSV
imports are not implemented.

Imports accept files up to 512 KiB, 250 VEVENT components and 2,000 occurrences in
one requested window. Expansion is limited to 20,000 iterations. Supported feeds
use UTC or IANA time zones and daily, weekly, monthly or yearly recurrence;
intraday recurrence is rejected. Recurrence exceptions and excluded dates are
supported. Custom VTIMEZONE definitions and Windows time-zone identifiers need
conversion to IANA identifiers in the exporting tool. Participant records,
organizer addresses, alarms, attachments and unrelated components are removed.
Descriptions remain plain text. Review content before publishing it to guests.

## Subscriptions and notifications

Open `/calendar` and choose **My subscriptions**. A guest can sign in with a
verified email and subscribe to public calendars without becoming a club member.
Approved membership is required for member calendars; signing in does not approve it.

Choose updates, an optional reminder (one hour or one day before), and whether to
receive email as well as notifications on the website. Preferences survive reload;
unsubscribe stops new notifications. Delivery depends on the local job loop.
Each calendar email also has a confirmation link to stop just that calendar's
emails without signing in, while retaining website notices. Resubscribing rotates
the link. In **Calendar → Emails**, choose a calendar to customize its update and
reminder templates. Each inherits the shared template until its own customization
is published. Shared defaults and SMTP/Resend connections live in
[Integrations → Email](email.md).
Emails contain a generic notice and a link to current details, so a forwarded
message does not disclose a private schedule. The notifications panel shows only
calendars the current account can still access.

Only published changes trigger update notifications. Saving drafts does not.
Reminder keys prevent duplicate queue entries, and the worker rechecks current
membership, subscription, feature state and activity timing before delivery.
SMTP retries use a stable message ID, a lease and bounded backoff. As with other
SMTP delivery, an interrupted send may be retried; exactly-once delivery is not
claimed. Failed email does not remove the notice from the website.

**Public calendar feed (.ics)** exports a rolling window of the past seven days
and next 90 days at `/calendar/feed`. Calendar apps can subscribe using that URL,
optionally with the `calendars` selection from the page's feed link. Their refresh
frequency is controlled by the external app. This endpoint never includes member
calendars, even with an administrator's cookie. There are no private bearer-feed
links in this version; member schedules remain on the signed-in website.

## Operator configuration and boundaries

The existing development launcher runs `jobs:run`. A standalone local runner is:

```text
node scripts/pnpm.mjs jobs:run
```

Remote network access is off by default: `CALENDAR_FEED_REQUESTS_ENABLED=false`.
After deliberate authorization to contact a feed, set it to `true` in the private
installation environment and restart the app and worker. Keep the installation's
credential-encryption key backed up securely; its loss makes saved feed links
unreadable. File imports and public calendar export do not require remote requests.
The network adapter requires HTTPS on port 443, rejects credentials in URLs,
private/reserved IPv4 destinations and redirects, pins DNS resolution to the
connection, and limits response time and size. IPv6-only feeds are not supported.

**Integrations → Calendar** controls feature availability. Disabling it hides
pages/blocks/feeds, rejects management operations and pauses notifications and sync.
Re-enabling restores published views; subscribers review preferences to resume
notifications, and staff choose Resume sync for connections. Saved history stays.

Current limits: 30 calendars, 200 schedules per calendar, five imports/connections
per calendar, seven-day activity duration, 93-day interactive queries, 2,000
displayed occurrences and 50 recent account notifications. Dense views suggest
fewer calendars or the week view. Oversized public exports ask for a narrower
calendar selection rather than silently returning an incomplete feed.

The implementation uses the existing application, restricted PostgreSQL runtime
role, Better Auth sessions, SMTP and job loop. External integration limitations are recorded in [the roadmap](../development/roadmap.md). Local import and
injected feed-transport checks do not prove a real remote provider connection.

For new providers, see [Calendar contribution contracts](../contributing/calendar-providers.md).
