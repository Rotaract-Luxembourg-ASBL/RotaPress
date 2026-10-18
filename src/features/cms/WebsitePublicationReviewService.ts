import "server-only";
import type {
  AuthorizationService,
  DatabaseExecutor,
  TrustedActor,
} from "@/core/authorization/AuthorizationService";
import type { Database } from "@/infrastructure/database/client";
import type { MediaService } from "../media/MediaService";
import { CmsRepository } from "./CmsRepository";
import {
  contentAssets,
  contentForms,
  contentSections,
  revisionDto,
} from "./cms_validation";
import { flattenBlocks, type CmsLocale } from "./cms_schemas";
import { FormPublicationReviewService } from "../forms/FormPublicationReviewService";
import { WebsiteReferenceReviewService } from "./WebsiteReferenceReviewService";
import type { WebsiteWorkspace } from "./website_setup_schemas";
import {
  websitePublicationItems,
  type WebsitePublicationReview,
  type WebsitePublicationScope,
} from "./website_publication";

/** Read-only publishing guidance. Transactional publication remains the authority. */
export class WebsitePublicationReviewService {
  private readonly repository: CmsRepository;
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly media: MediaService,
  ) {
    this.repository = new CmsRepository(db);
  }

  async read(
    actor: TrustedActor,
    workspace: WebsiteWorkspace,
    locale: CmsLocale,
    scope: WebsitePublicationScope,
    executor: DatabaseExecutor = this.db,
  ): Promise<WebsitePublicationReview> {
    const { organizationId } = await this.authorization.require(
      actor,
      "cms.publish",
      executor,
    );
    const items = websitePublicationItems(workspace, scope);
    const problems: WebsitePublicationReview["problems"] = [];
    const uses = new Map<string, { label: string; href: string }[]>();
    const formUses = new Map<string, { label: string; href: string }[]>();
    const add = (
      id: string | null | undefined,
      label: string,
      href: string,
    ) => {
      if (!id) return;
      const current = uses.get(id) ?? [];
      if (!current.some((use) => use.label === label && use.href === href))
        current.push({ label, href });
      uses.set(id, current);
    };
    if (scope === "menu") {
      if (!workspace.site.published)
        problems.push({
          message:
            "Publish the website once before publishing menu changes separately.",
        });
      for (const item of items) {
        if (!item.publishedRevisionId)
          problems.push({
            message: `“${item.title}” is not published yet. Publish this page first, or choose Entire website.`,
            href: `/admin/website/${item.id}?locale=${locale}`,
          });
      }
    } else {
      const settings = workspace.site.draft;
      const appearance = `/admin/website?tab=appearance&locale=${locale}`;
      add(
        settings.branding.logoId,
        "Club logo · Branding & appearance",
        appearance,
      );
      add(
        settings.branding.iconId,
        "Browser icon (favicon) · Branding & appearance",
        appearance,
      );
      add(
        settings.seo?.socialImageId,
        "Default sharing image · Search & sharing",
        `/admin/website?tab=seo&locale=${locale}`,
      );
      for (const item of items) {
        const variant = await this.repository.variant(
          organizationId,
          item.id,
          locale,
          executor,
        );
        const row = variant
          ? await this.repository.revision(
              variant.id,
              item.draftRevisionId,
              executor,
            )
          : null;
        if (!row) {
          problems.push({
            message: `“${item.title}” changed. Close this review and reload the website.`,
          });
          continue;
        }
        const draft = revisionDto(row, item.kind);
        const href = `/admin/website/${item.id}?locale=${locale}`;
        problems.push(
          ...(await new WebsiteReferenceReviewService(this.db).read(
            organizationId,
            locale,
            draft.data,
            item.title,
            href,
            executor,
          )),
        );
        const addForms = (ids: string[], label: string) => {
          for (const id of ids) {
            const current = formUses.get(id) ?? [];
            if (!current.some((use) => use.label === label))
              current.push({ label, href });
            formUses.set(id, current);
          }
        };
        addForms(contentForms(draft.data), item.title);
        for (const sectionId of contentSections(draft.data)) {
          const section = await this.repository.variant(
            organizationId,
            sectionId,
            locale,
            executor,
          );
          const revision = section?.publishedRevisionId
            ? await this.repository.revision(
                section.id,
                section.publishedRevisionId,
                executor,
              )
            : null;
          if (revision) {
            const sectionData = revisionDto(revision, "section").data;
            problems.push(
              ...(await new WebsiteReferenceReviewService(this.db).read(
                organizationId,
                locale,
                sectionData,
                `${item.title} · Reusable section`,
                href,
                executor,
              )),
            );
            addForms(
              contentForms(sectionData),
              `${item.title} · Reusable section`,
            );
          } else
            problems.push({
              message: `A reusable section used by “${item.title}” must be published first.`,
              href: `/admin/website/${sectionId}?locale=${locale}`,
            });
        }
        add(draft.socialImageId, `${item.title} · Sharing image`, href);
        for (const block of flattenBlocks(draft.data.content)) {
          if (block.type === "Columns" || block.type === "SiteRow") continue;
          for (const id of contentAssets({ ...draft.data, content: [block] }))
            add(
              id,
              `${item.title} · ${block.type.replace(/([a-z])([A-Z])/g, "$1 $2")}`,
              href,
            );
        }
      }
    }
    const images: WebsitePublicationReview["images"] = [];
    const ids = [...uses.keys()];
    for (let offset = 0; offset < ids.length; offset += 500) {
      for (const issue of await this.media.publicationIssues(
        actor,
        ids.slice(offset, offset + 500),
        executor,
      )) {
        const { referenceId, ...image } = issue;
        images.push({
          ...image,
          uses: uses.get(referenceId)!,
        });
      }
    }
    const forms = await new FormPublicationReviewService(
      this.db,
      this.authorization,
    ).read(actor, [...formUses.keys()], executor);
    return {
      scope,
      locale,
      version: workspace.site.version,
      images,
      forms: forms.map((form) => ({ ...form, uses: formUses.get(form.id)! })),
      problems,
      pages: items.map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        expectedRevisionId:
          scope === "menu"
            ? (item.publishedRevisionId ?? item.draftRevisionId)
            : item.draftRevisionId,
        changed:
          scope === "website" &&
          item.publishedRevisionId !== item.draftRevisionId,
      })),
    };
  }
}
