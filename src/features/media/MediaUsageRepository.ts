import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseExecutor } from "@/core/authorization/AuthorizationService";
import { collectionPage } from "@/core/collections";
import type { MediaUsageDestination, MediaUsageQuery } from "./media_usage";

type Access = {
  albums: boolean;
  website: boolean;
  events: boolean;
  projects: boolean;
  directory: boolean;
  managesEvents: boolean;
};
const candidate = z.object({
  kind: z.enum([
    "album",
    "page",
    "appearance",
    "event-directory",
    "project",
    "profile",
  ]),
  source_id: z.string().nullable(),
  event_id: z.uuid().nullable(),
  locale: z.enum(["en", "fr", "lb"]).nullable(),
  title: z.string(),
  published: z.boolean(),
  retained: z.boolean(),
});

/** Resolve and group all retained references in PostgreSQL before paging destinations. */
export class MediaUsageRepository {
  async page(
    tx: DatabaseExecutor,
    organizationId: string,
    actorId: string,
    assetId: string,
    input: MediaUsageQuery,
    access: Access,
  ) {
    const checkpointPrefix = `cms-checkpoint:${actorId}:`;
    const source = sql`
      with raw_refs as (
        select owner_key, published, split_part(owner_key, ':', 1) as family,
          case when split_part(owner_key, ':', 1) = 'cms-checkpoint'
            then case when starts_with(owner_key, ${checkpointPrefix})
              then substr(owner_key, length(${checkpointPrefix}) + 1) end
            else split_part(owner_key, ':', 2) end as reference
        from club.media_usage
        where organization_id = ${organizationId} and asset_id = ${assetId}
      ), refs as (
        select *, case when reference ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then reference::uuid end as reference_id from raw_refs
      ), resolved as (
        select 'album:' || a.id::text as key, 'album'::text as kind,
          a.id::text as source_id, null::uuid as event_id, null::text as locale,
          left(coalesce(ar.data->>'title', 'Photo album'), 160) as title, r.published
        from refs r join club.media_album a on a.id = r.reference_id
          and a.organization_id = ${organizationId}
        join club.media_album_revision ar on ar.id = a.draft_revision_id
        where r.family = 'album'
        union all
        select 'page:' || v.id::text, 'page', c.id::text, c.event_id, v.locale,
          draft.title, r.published
        from refs r join club.cms_revision retained on retained.id = r.reference_id
        join club.cms_variant v on v.id = retained.variant_id and v.organization_id = ${organizationId}
        join club.cms_content c on c.id = v.content_id and c.organization_id = ${organizationId}
        join club.cms_revision draft on draft.id = v.draft_revision_id
        where r.family = 'cms-revision'
        union all
        select 'page:' || v.id::text, 'page', c.id::text, c.event_id, v.locale,
          draft.title, r.published
        from refs r join club.cms_variant v on v.id = r.reference_id and v.organization_id = ${organizationId}
        join club.cms_content c on c.id = v.content_id and c.organization_id = ${organizationId}
        join club.cms_revision draft on draft.id = v.draft_revision_id
        where r.family in ('cms', 'cms-checkpoint')
        union all
        select 'appearance:' || reference, 'appearance', null, null, reference,
          'Website appearance (' || reference || ')', published
        from refs where family = 'cms-site' and reference in ('en', 'fr', 'lb')
        union all
        select 'event-directory:' || reference, 'event-directory', null, null, reference,
          'Events directory (' || reference || ')', published
        from refs where family = 'event-directory' and reference in ('en', 'fr', 'lb')
        union all
        select 'project:' || p.id::text, 'project', p.id::text, null, null,
          left(coalesce(p.draft->>'title', 'Project'), 160), r.published
        from refs r join club.project p on p.id = r.reference_id and p.organization_id = ${organizationId}
        where r.family = 'project'
        union all
        select 'profile', 'profile', null, null, null, 'Community directory profiles', r.published
        from refs r join club.partner p on p.id = r.reference_id and p.organization_id = ${organizationId}
        where r.family = 'partner'
      ), destinations as (
        select key, kind, source_id, event_id, locale, title,
          bool_or(published) as published, bool_or(not published) as retained
        from resolved r where
          (kind = 'album' and ${access.albums}) or
          (kind = 'appearance' and ${access.website}) or
          (kind = 'event-directory' and ${access.events} and ${access.website}) or
          (kind = 'project' and ${access.projects}) or
          (kind = 'profile' and ${access.directory}) or
          (kind = 'page' and ((event_id is null and ${access.website}) or
            (event_id is not null and ${access.events} and (${access.managesEvents} or exists (
              select 1 from club.event_manager assignment
              where assignment.organization_id = ${organizationId}
                and assignment.event_id = r.event_id and assignment.user_id = ${actorId}
            )))))
        group by key, kind, source_id, event_id, locale, title
      )`;
    const count = await tx.execute(
      sql`${source} select count(*)::integer as total from destinations`,
    );
    const total = z
      .object({ total: z.int().nonnegative() })
      .parse(count.rows[0]).total;
    const page = collectionPage(total, input.page, input.pageSize);
    const result = await tx.execute(sql`${source}
      select kind, source_id, event_id, locale, title, published, retained
      from destinations order by key limit ${input.pageSize} offset ${(page - 1) * input.pageSize}`);
    const destinations: MediaUsageDestination[] = z
      .array(candidate)
      .parse(result.rows)
      .map((row) => ({
        href:
          row.kind === "album"
            ? `/admin/media/albums?album=${row.source_id}`
            : row.kind === "page"
              ? row.event_id
                ? `/admin/events/${row.event_id}/page/${row.source_id}?locale=${row.locale}`
                : `/admin/website/${row.source_id}?locale=${row.locale}`
              : row.kind === "project"
                ? `/admin/projects/${row.source_id}`
                : row.kind === "appearance"
                  ? `/admin/website?locale=${row.locale}&tab=appearance`
                  : row.kind === "event-directory"
                    ? `/admin/events?tab=directory&locale=${row.locale}`
                    : "/admin/partners",
        title: row.title,
        kind:
          row.kind === "appearance" || row.kind === "event-directory"
            ? "website"
            : row.kind,
        published: row.published,
        retained: row.retained,
      }));
    return { destinations, total, page, pageSize: input.pageSize };
  }
}
