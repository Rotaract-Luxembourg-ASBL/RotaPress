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
import { createInput } from "./cms_commands";
import { isSitePart } from "./cms_schemas";
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
        slug: parsed.slug,
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
