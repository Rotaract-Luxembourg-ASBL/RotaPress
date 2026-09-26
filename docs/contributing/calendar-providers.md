# Contributing Calendar providers

Read [CONTRIBUTING.md](../../CONTRIBUTING.md), [AGENTS.md](../../AGENTS.md) and
[Calendar operation](../guides/calendar.md) first. Calendar is a feature module with a
small provider interface. Provider extensions are reviewed source contributions
compiled into the application. Website users cannot upload executable plugins.

## Ownership

| Responsibility                                             | Owner                                   |
| ---------------------------------------------------------- | --------------------------------------- |
| Provider document parsing and bounded recurrence           | `CalendarImportAdapter` implementations |
| Explicit supported-provider registry                       | `providers/adapters.ts`                 |
| Authorization, encryption, drafts, publication and refresh | `CalendarSourceService`                 |
| HTTPS, DNS pinning and network limits                      | `CalendarFeedClient`                    |
| Public/member projection and event merging                 | `CalendarReader`                        |
| Manual calendar and schedule changes                       | `CalendarService`                       |
| Own-account preferences and notices                        | `CalendarSubscriptionService`           |
| Notification queue, current-access checks and SMTP retry   | `CalendarNotificationRunner`            |
| Time-zone-aware native recurrence                          | `calendar_dates.ts`                     |
| Public iCalendar serialization                             | `calendar_ical.ts`                      |

Services receive their dependencies in `src/composition/services.ts`. The adapter
does not receive a database, credentials, session, mailer or network client.
Provider parsing cannot grant access, publish content or send a message.

## Add a document adapter

Implement `src/features/calendar/providers/CalendarImportAdapter.ts` in a focused
class. Use `IcalendarAdapter` as an example of the parser and projection contract.

```ts
interface CalendarImportAdapter {
  readonly key: string;
  readonly label: string;
  normalize(document: string, timezone: string): string;
  occurrences(
    document: string,
    timezone: string,
    sourceId: string,
    calendarId: string,
    range: CalendarRange,
  ): Occurrence[];
}
```

`normalize` validates an untrusted document, removes unsupported/private metadata
and returns deterministic stored content. Changes to irrelevant provider fields
must not cause repeated update notifications. Never include credentials, attendees,
organizer identities, executable markup or arbitrary nested payloads.

`occurrences` projects only the requested half-open date window. It must enforce
resource bounds, use IANA time zones correctly, keep stable source-scoped IDs and
produce the shared narrow `Occurrence` DTO. Safe URLs and plain text remain
mandatory. Use exclusive ends for all-day dates. Do not synthesize membership or
copy event attendance records into calendar output.

Register a constructed adapter explicitly in `providers/adapters.ts`; the source
service resolves only this allowlist. Add the format's file-picker support and
plain-language limits to the import UI if it is not an `.ics` format. The current
picker accepts iCalendar files. Keep existing saved provider keys compatible:
removing an adapter needs a migration or an explicit supported-data transition.

To add a provider API rather than a document format, first describe its precise
authorization, token, pagination and replay contract. Implement a bounded adapter
using existing server credential storage and centralized Better Auth where OAuth
is involved. Do not add a second login implementation or route provider secrets
through public DTOs. Network calls belong in a provider transport, never a CMS
block or a React component. A new provider requires its own authorized live run
before documenting support for that provider's live integration.

## Required behavior and verification

- Authorization comes from the current server session and organization. Ordinary
  members/guests cannot manage sources. Outbound connections also require
  `integrations.manage`; scheduled work rechecks its initiating staff authority.
- Review creates a private draft. Updates are private unless the administrator
  explicitly selected automatic publication after the first reviewed publication.
- Refresh replaces only that source's projection. Keep manual schedules and the
  last good content when the provider fails. Use version checks on concurrent work.
- Source URLs may contain credentials. Encrypt them; return only the hostname.
  Logs and audit entries contain identifiers and outcome codes, not documents/URLs.
- Feature disable/re-enable must not restart previously authorized background work.
  Membership revocation must immediately remove access to member calendars.
- Public feeds must remain public-only even when requested with a staff cookie.

Extend the existing **C13** group in `tests/critical/calendar-source-cases.ts`
for the provider's actual dangerous behavior: malformed/bounded input, stable
identities, exclusions/DST, private-field stripping, failed refresh and replay.
Use synthetic documents and an injected `CalendarFeedTransport`; never make
real provider requests in the normal test suite. Scoped repository/constraint
checks use the dedicated PostgreSQL test database.

The Calendar walkthrough extends **B02** in `tests/browser/calendar-journey.ts`.
It uses real local OTP sessions, publication, import review, own subscriptions and
the actual CMS renderer. Extend that journey only when the user workflow changes.
Run the affected C13 checks while editing, then `node scripts/pnpm.mjs verify`
for the completed change. Record results and external-provider limitations in
the pull request. Follow the 800-line limit and
[product UX rules](../development/product-ux.md).

## Libraries and standards

- [`ical.js`](https://github.com/kewisch/ical.js) (MPL-2.0) parses
  [iCalendar, RFC 5545](https://www.rfc-editor.org/info/rfc5545/).
- [`@js-temporal/polyfill`](https://github.com/js-temporal/temporal-polyfill)
  (ISC) provides time-zone-aware arithmetic; see
  [ZonedDateTime](https://tc39.es/proposal-temporal/docs/zoneddatetime.html).

The manifest and lockfile pin the supported versions. Preserve their license
notices when redistributing dependencies; these libraries do not change
RotaPress's code license.
