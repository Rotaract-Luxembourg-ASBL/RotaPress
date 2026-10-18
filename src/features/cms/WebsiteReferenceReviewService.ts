import "server-only";
import type { DatabaseExecutor } from "@/core/authorization/AuthorizationService";
import type { Database } from "@/infrastructure/database/client";
import { AlbumReader } from "../media/AlbumReader";
import { PartnerReader } from "../partners/PartnerReader";
import { CmsRepository } from "./CmsRepository";
import { contentAlbums } from "./cms_albums";
import { contentPartners } from "./cms_validation";
import { flattenBlocks, type CmsData, type CmsLocale } from "./cms_schemas";
import type { WebsitePublicationReview } from "./website_publication";

/** Read-only explanations of existing reference gates; no dependency is published here. */
export class WebsiteReferenceReviewService {
  private readonly repository: CmsRepository;
  constructor(private readonly db: Database) {
    this.repository = new CmsRepository(db);
  }

  async read(
    organizationId: string,
    locale: CmsLocale,
    data: CmsData,
    title: string,
    href: string,
    executor: DatabaseExecutor,
  ): Promise<WebsitePublicationReview["problems"]> {
    const problems: WebsitePublicationReview["problems"] = [];
    for (const album of await new AlbumReader(this.db).publicationIssues(
      organizationId,
      contentAlbums(data),
      executor,
    )) {
      problems.push({
        message: album.unavailable
          ? `“${title}” uses an unavailable photo album. Remove or replace it on the page.`
          : `Publish the photo album “${album.name}” used by “${title}”, or remove its link from the page.`,
        href: album.unavailable
          ? href
          : `/admin/media/albums?album=${album.id}`,
      });
    }
    for (const profile of await new PartnerReader().publicationIssues(
      organizationId,
      contentPartners(data),
      executor,
    )) {
      problems.push({
        message: profile.unavailable
          ? `“${title}” uses an unavailable directory profile. Remove or replace it on the page.`
          : `Publish the directory profile “${profile.name}” used by “${title}”, or remove it from the page.`,
        href: profile.unavailable
          ? href
          : `/admin/partners?search=${encodeURIComponent(profile.name)}`,
      });
    }
    for (const id of new Set(
      flattenBlocks(data.content).flatMap((block) =>
        block.type === "PageCollection" ? block.props.pageIds : [],
      ),
    )) {
      const page = await this.repository.content(organizationId, id, executor);
      const variant = await this.repository.variant(
        organizationId,
        id,
        locale,
        executor,
      );
      if (
        !page ||
        page.kind !== "page" ||
        page.eventId ||
        page.archivedAt ||
        !variant
      )
        problems.push({
          message: `“${title}” has an unavailable page card. Choose an active page in this language.`,
          href,
        });
    }
    return problems;
  }
}
