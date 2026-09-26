import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { installation } from "../../../db/schema/club";
import { mediaAsset } from "../../../db/schema/media";
import { project } from "../../../db/schema/projects";
import type { DatabaseExecutor } from "../../core/authorization/AuthorizationService";
import { FeatureAvailability } from "../../core/features/FeatureAvailability";
import type { Database } from "../../infrastructure/database/client";
import { projectContentSchema, type PublicProject } from "./project_schemas";

/** Public projections deliberately never select a draft or private editorial metadata. */
export class ProjectReader {
  private readonly features: FeatureAvailability;
  constructor(private readonly db: Database) {
    this.features = new FeatureAvailability(db);
  }

  async publicList(): Promise<PublicProject[]> {
    const id = await this.organizationId();
    return id ? this.published(id, this.db) : [];
  }

  async publicBySlug(slug: string): Promise<PublicProject | null> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 180)
      return null;
    const id = await this.organizationId();
    return id ? ((await this.published(id, this.db, slug))[0] ?? null) : null;
  }

  async published(
    organizationId: string,
    executor: DatabaseExecutor = this.db,
    slug?: string,
  ): Promise<PublicProject[]> {
    if (!(await this.features.enabled(organizationId, "projects", executor)))
      return [];
    const rows = await executor
      .select({
        id: project.id,
        slug: project.slug,
        content: project.published,
      })
      .from(project)
      .where(
        and(
          eq(project.organizationId, organizationId),
          eq(project.archived, false),
          isNotNull(project.published),
          slug ? eq(project.slug, slug) : undefined,
        ),
      )
      .orderBy(project.id);
    const published = rows.flatMap((row) => {
      const content = projectContentSchema.safeParse(row.content);
      return content.success
        ? [{ id: row.id, slug: row.slug, ...content.data }]
        : [];
    });
    const coverIds = [
      ...new Set(
        published.flatMap((item) =>
          item.coverImageId ? [item.coverImageId] : [],
        ),
      ),
    ];
    const coverAlts = new Map<string, string>();
    for (let offset = 0; offset < coverIds.length; offset += 256) {
      const covers = await executor
        .select({ id: mediaAsset.id, alt: mediaAsset.alt })
        .from(mediaAsset)
        .where(
          and(
            eq(mediaAsset.organizationId, organizationId),
            eq(mediaAsset.visibility, "public"),
            inArray(mediaAsset.id, coverIds.slice(offset, offset + 256)),
          ),
        );
      for (const cover of covers) coverAlts.set(cover.id, cover.alt);
    }
    return published.map((item) => {
      const coverAlt = item.coverImageId
        ? coverAlts.get(item.coverImageId)
        : undefined;
      return coverAlt === undefined ? item : { ...item, coverAlt };
    });
  }

  private async organizationId() {
    const [row] = await this.db
      .select({ id: installation.organizationId })
      .from(installation)
      .where(eq(installation.id, 1));
    return row?.id;
  }
}
