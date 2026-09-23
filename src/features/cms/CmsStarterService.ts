import "server-only";
import type { TrustedActor } from "@/core/authorization/AuthorizationService";
import type { CmsService } from "./CmsService";
import { pageTemplateIdSchema, starterPages } from "./page_templates";

/** Explicit starter creation preserves existing content and never publishes it. */
export class CmsStarterService {
  constructor(private readonly cms: CmsService) {}

  async create(actor: TrustedActor): Promise<{ created: number }> {
    const existing = await this.cms.list(actor);
    let created = 0;
    for (const starter of starterPages) {
      if (
        existing.some(
          (item) =>
            item.kind === "page" &&
            item.locale === "en" &&
            item.slug === starter.slug,
        )
      )
        continue;
      await this.cms.create(actor, {
        kind: "page",
        title: starter.title,
        slug: starter.slug,
        locale: "en",
        templateId: pageTemplateIdSchema.parse(starter.slug),
      });
      created++;
    }
    return { created };
  }
}
