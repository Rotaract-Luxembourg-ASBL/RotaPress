import { sql, type SQL } from "drizzle-orm";

// These fragments use the configured form alias in each eligibility query.
export const eventDeliveryAllowed = (
  reviewedAt: SQL,
) => sql`(configured.event_id is null or exists (
  select 1 from club.event e where e.id = configured.event_id and e.organization_id = configured.organization_id
    and e.archived_at is null and e.cancelled_at is null and e.published is not null
    and not exists (select 1 from unnest(case when configured.kind = 'registration'
      then array['website', 'forms', 'registration'] else array['website', 'forms'] end) as required(key)
      where not exists (select 1 from club.event_module m where m.event_id = e.id
        and m.organization_id = e.organization_id and m.key = required.key and m.state = 'enabled'
        and (m.last_disabled_at is null or m.last_disabled_at < ${reviewedAt})))
))`;

export const featureDeliveryAllowed = (reviewedAt: SQL) => sql`not exists (
  select 1 from club.feature f where f.organization_id = configured.organization_id
  and (f.key = 'forms' or (f.key = 'events' and configured.event_id is not null))
  and (not f.enabled or f.last_disabled_at >= ${reviewedAt})
)`;
