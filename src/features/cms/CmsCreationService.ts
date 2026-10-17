import "server-only";
import { cmsContent } from "../../../db/schema/cms";
import {
  DomainError,
  type AuthorizationService,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import { AuditRepository } from "../../core/audit/AuditRepository";
import type { CmsRepository } from "./CmsRepository";
import type { CmsScopePolicy } from "./CmsScopePolicy";
import type { CmsRevisionWriter } from "./CmsRevisionWriter";
import { createInput, duplicateInput } from "./cms_commands";
import { isSitePart, emptyCmsData } from "./cms_schemas";
import { validateContent } from "./cms_validation";
import { sitePartStarter } from "./site_part_starter";
import { copyPageTemplate } from "./page_templates";
import { withDefaultEventDesign } from "../events/event_design";

/** Shared creation transaction for the editor, setup and bounded content imports. */
export class CmsCreationService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly repository: CmsRepository,
    private readonly scope: CmsScopePolicy,
    private readonly revisions: CmsRevisionWriter,
  ) {}
  async addLocale(actor: TrustedActor, input: unknown, tx: Transaction) {
    const parsed = duplicateInput.parse(input);
    const { organizationId } = await this.scope.lock(
      actor,
      parsed.id,
      "cms.edit",
      tx,
    );
    const content = await this.repository.content(
      organizationId,
      parsed.id,
      tx,
    );
    if (!content || content.archivedAt)
      throw new DomainError(
        "CONTENT_NOT_FOUND",
        "The requested content is unavailable.",
        404,
      );
    if (
      await this.repository.variant(
        organizationId,
        parsed.id,
        parsed.locale,
        tx,
      )
    )
      throw new DomainError(
        "LOCALE_EXISTS",
        "This language already has a draft.",
        409,
      );
    await this.revisions.createVariant(
      tx,
      actor,
      organizationId,
      parsed.id,
      parsed.locale,
      {
        title: parsed.title,
        slug: parsed.slug,
        description: "",
        socialImageId: null,
        data: isSitePart(content.kind)
          ? sitePartStarter(content.kind)
          : content.eventId
            ? withDefaultEventDesign(emptyCmsData)
            : emptyCmsData,
      },
    );
    await new AuditRepository().record(tx, {
      organizationId,
      actorUserId: actor.userId,
      action: "cms.locale.created",
      targetId: parsed.id,
    });
  }
  async create(actor: TrustedActor, input: unknown, tx: Transaction) {
    const parsed = createInput.parse(input);
    if (
      parsed.event &&
      (parsed.kind !== "page" ||
        (parsed.templateId !== "blank" &&
          !(
            parsed.event.moduleKey === "website" &&
            (parsed.templateId.endsWith(":event-detail") ||
              parsed.templateId.startsWith("event-layout:") ||
              parsed.templateId === "event-reference")
          )))
    )
      throw new DomainError(
        "EVENT_PAGE_ONLY",
        "Choose a blank page or an event layout for the main event page.",
        422,
      );
    if (parsed.kind !== "page" && parsed.templateId !== "blank") {
      throw new DomainError(
        "PAGE_TEMPLATE_ONLY",
        "Page templates can only start a new page.",
        422,
      );
    }
    const data = validateContent(
      isSitePart(parsed.kind)
        ? sitePartStarter(parsed.kind)
        : parsed.event
          ? withDefaultEventDesign(copyPageTemplate(parsed.templateId))
          : copyPageTemplate(parsed.templateId),
      parsed.kind,
    );
    const { organizationId } = parsed.event
      ? await this.scope.create(
          actor,
          parsed.event.id,
          parsed.event.moduleKey,
          tx,
        )
      : await this.authorization.lock(actor, "cms.edit", tx);
    let slug = parsed.slug;
    if (!slug) {
      const stem =
        parsed.title
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 85) || "page";
      const used = new Set(
        (await this.repository.list(organizationId, tx))
          .filter((item) => item.locale === parsed.locale)
          .map((item) => item.slug),
      );
      slug = stem;
      for (let suffix = 2; used.has(slug); suffix++) slug = `${stem}-${suffix}`;
    }
    if (
      parsed.event &&
      (await this.repository.list(organizationId, tx, parsed.event.id)).some(
        (item) => item.moduleKey === parsed.event!.moduleKey && !item.archived,
      )
    )
      throw new DomainError(
        "EVENT_PAGE_EXISTS",
        "Open the existing feature page or add a language to it.",
        409,
      );
    if (
      isSitePart(parsed.kind) &&
      (await this.repository.list(organizationId, tx)).some(
        (item) => item.kind === parsed.kind && !item.archived,
      )
    ) {
      throw new DomainError(
        "SITE_PART_EXISTS",
        "This shared site part already exists. Open it or add its language from the site editor.",
        409,
      );
    }
    const [content] = await tx
      .insert(cmsContent)
      .values({
        organizationId,
        kind: parsed.kind,
        eventId: parsed.event?.id,
        moduleKey: parsed.event?.moduleKey,
      })
      .returning();
    await this.scope.validate(content, data, null, tx, actor);
    await this.revisions.createVariant(
      tx,
      actor,
      organizationId,
      content.id,
      parsed.locale,
      {
        title: parsed.title,
        slug,
        description: "",
        socialImageId: null,
        data,
      },
    );
    await new AuditRepository().record(tx, {
      organizationId,
      actorUserId: actor.userId,
      action: "cms.created",
      targetId: content.id,
    });
    return content.id;
  }
}
