# Member portal

Members can find club activities, manage bookings and update personal details at
`/membership`. The portal shows only records and calendars the signed-in account
can access.

## Navigation and workflows

| Area         | What members can do                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Home         | See the next three available activities within 60 days, recent responses, membership status and recent confirmed registrations. |
| Calendar     | Explore the existing audience-aware calendar, open activity details and choose email updates/reminders.                         |
| My bookings  | Review/cancel native registrations, accept assigned event invitations and open the private booking details.                     |
| My responses | Read the status of forms submitted while signed in to this account.                                                             |
| My profile   | Save personal details, see membership status and apply when eligible.                                                           |

Navigation uses URLs such as `/membership?tab=profile`, so reloading retains the
selected area. Desktop navigation has five destinations; phones use a labeled
menu with Escape dismissal and focus return. Calendar and booking destinations
follow current feature availability. The administration link appears only for
accounts with current staff capabilities.

The portal uses the published club identity and logo with its own workspace
layout. The public membership application and standalone calendar, registration
and guest pages remain available.

An approved membership is a compact status on Home. Application, suspension and
other membership states still explain the next step; the full membership panel is
also available under My profile. Membership status refreshes when returning to the
window. Profile edits warn before following a portal link or signing out, and
before reloading with unsaved changes. Saving retains the existing version check
and keeps entered details if the request fails.

Bookings reuse the existing registration and guest components. In the member
portal, accepting an invitation opens its scoped booking details within the same
workspace. Native cancellation still requires explicit confirmation. Guest-only
accounts can use their own invitations without acquiring club membership.

## Data and boundaries

The server checks verified identity, record
ownership, membership audience and feature availability on every protected call.

- Upcoming activities are from Calendar, using the club's time
  zone. Canceled and ended occurrences are excluded from the home selection.
  Opening an item selects its date in the calendar.
- Response history contains titles, dates and statuses, without private answers.
  Anonymous submissions are not matched to an account by email.
- Booking history retains the existing limits: 200 registrations, 100 available
  invitations and 50 recent form responses. The home view is a selection, not an
  attendance total or a new reporting feature.
- Profile, membership approval, event registration and guest entitlement remain
  distinct. A visible menu or client query never grants access.

## Staff access

The administration header shares published club identity and provides an account
menu linking to the member profile. Ordinary members cannot enter administration.
Current staff capabilities and explicit event assignments determine permitted
workspaces; revocation takes effect on the server. Phone navigation supports
keyboard dismissal and focus return.

Use the [guest portal](guest-portal.md) for private event invitation boundaries and
[Google sign-in](google-authentication.md) for the platform-wide login policy.
Google only applies to member and guest accounts as well as staff. Email codes
are available when the club allows both sign-in methods.
