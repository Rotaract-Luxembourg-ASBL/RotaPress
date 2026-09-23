import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { cmsContent, cmsVariant } from "../../../db/schema/cms";
import type { Database } from "../../infrastructure/database/client";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import { AuditRepository } from "../../core/audit/AuditRepository";
import { MediaService } from "../media";
import { CmsDraftService } from "./CmsDraftService";
import { CmsRevisionWriter } from "./CmsRevisionWriter";
import { CmsRepository } from "./CmsRepository";
import { CmsScopePolicy } from "./CmsScopePolicy";
import { EventService } from "../events/EventService";
import { EventModuleService } from "../events/EventModuleService";
import { withDefaultEventDesign } from "../events/event_design";
import { CmsSiteService } from "./CmsSiteService";
import { CmsReferencePolicy } from "./CmsReferencePolicy";
import { sitePartStarter } from "./site_part_starter";
import { copyPageTemplate } from "./page_templates";
import { CmsPublicReader } from "./CmsPublicReader";
import { CmsEventParticipationReader } from "./CmsEventParticipationReader";
import { FormService } from "../forms/FormService";
import {
  isSitePart,
  emptyCmsData,
  type CmsDetail,
  type CmsLocale,
  type PublicPage,
} from "./cms_schemas";
import { contentAssets, validateContent, revisionDto } from "./cms_validation";

import {
  variantInput,
  expectedInput,
  createInput,
  saveInput,
  duplicateInput,
  restoreInput,
} from "./cms_commands";
type Variant = typeof cmsVariant.$inferSelect;

export class CmsService {
  private readonly repository: CmsRepository;
  private readonly revisions: CmsRevisionWriter;
  readonly drafts: CmsDraftService;
  private readonly site: CmsSiteService;
  private readonly references: CmsReferencePolicy;
  private readonly publicReader: CmsPublicReader;
  private readonly scope: CmsScopePolicy;
  private readonly audit = new AuditRepository();

  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly media: MediaService,
    forms: FormService,
    private readonly events = new EventService(db, authorization),
    modules = new EventModuleService(db, events),
  ) {
    this.repository = new CmsRepository(db);
    this.revisions = new CmsRevisionWriter(media);
    this.site = new CmsSiteService(db, authorization, this.repository, media);
    this.references = new CmsReferencePolicy(db, this.repository, forms);
    this.publicReader = new CmsPublicReader(db, this.repository, media);
    this.scope = new CmsScopePolicy(
      db,
      authorization,
      this.repository,
      events,
      modules,
      media,
    );
    this.drafts = new CmsDraftService(
      this.repository,
      this.scope,
      this.references,
      this.revisions,
      media,
    );
  }

  async list(actor: TrustedActor) {
    const { organizationId } = await this.authorization.require(
      actor,
      "cms.edit",
    );
    return this.repository.list(organizationId);
  }

  async detail(
    actor: TrustedActor,
    rawId: unknown,
    rawLocale: unknown,
  ): Promise<CmsDetail> {
    const { id, locale } = variantInput.parse({ id: rawId, locale: rawLocale });
    const { organizationId } = await this.scope.read(actor, id);
    const { content, variant, revision } = await this.load(
      organizationId,
      id,
      locale,
    );
    return {
      id,
      kind: content.kind,
      event: await this.scope.context(actor, content),
      locale,
      draft: revisionDto(revision, content.kind),
      publishedRevisionId: variant.publishedRevisionId,
      archived: content.archivedAt !== null,
      revisions: await this.repository.revisions(variant.id),
      affectedPages:
        content.kind !== "page"
          ? await this.references.affectedPages(
              organizationId,
              id,
              locale,
              this.db,
              content.kind,
            )
          : [],
    };
  }

  async create(actor: TrustedActor, input: unknown): Promise<CmsDetail> {
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
    const id = await this.db.transaction(async (tx) => {
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
          (item) =>
            item.moduleKey === parsed.event!.moduleKey && !item.archived,
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
      await this.scope.validate(content, data, null, tx);
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
      await this.record(tx, actor, organizationId, "cms.created", content.id);
      return content.id;
    });
    return this.detail(actor, id, parsed.locale);
  }

  async addLocale(actor: TrustedActor, input: unknown): Promise<CmsDetail> {
    const parsed = duplicateInput.parse(input);
    await this.db.transaction(async (tx) => {
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
      if (!content || content.archivedAt) this.notFound();
      if (
        await this.repository.variant(
          organizationId,
          parsed.id,
          parsed.locale,
          tx,
        )
      ) {
        throw new DomainError(
          "LOCALE_EXISTS",
          "This language already has a draft.",
          409,
        );
      }
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
      await this.record(
        tx,
        actor,
        organizationId,
        "cms.locale.created",
        parsed.id,
      );
    });
    return this.detail(actor, parsed.id, parsed.locale);
  }

  async save(actor: TrustedActor, input: unknown): Promise<CmsDetail> {
    const parsed = saveInput.parse(input);
    await this.db.transaction((tx) => this.drafts.save(actor, parsed, tx));
    return this.detail(actor, parsed.id, parsed.locale);
  }

  async publish(actor: TrustedActor, input: unknown): Promise<CmsDetail> {
    const parsed = expectedInput.parse(input);
    await this.db.transaction((tx) => this.publishRevision(actor, parsed, tx));
    return this.detail(actor, parsed.id, parsed.locale);
  }

  /** Shared by immediate publication and its durable job's atomic transaction. */
  async publishRevision(
    actor: TrustedActor,
    input: unknown,
    tx: Transaction,
  ): Promise<void> {
    const parsed = expectedInput.parse(input);
    const { organizationId } = await this.scope.lock(
      actor,
      parsed.id,
      "cms.publish",
      tx,
    );
    const { content, variant, revision } = await this.load(
      organizationId,
      parsed.id,
      parsed.locale,
      tx,
    );
    this.editable(content.archivedAt, variant, parsed.expectedRevisionId);
    const draft = revisionDto(revision, content.kind);
    await this.scope.validate(content, draft.data, draft.socialImageId, tx);
    await this.scope.validatePublication(content, draft.data, tx);
    await this.references.validateReferences(
      organizationId,
      draft.data,
      parsed.locale,
      true,
      tx,
      content.eventId,
    );
    const assets = contentAssets(draft.data, draft.socialImageId);
    await this.media.assertPublicAssets(organizationId, assets, tx);
    if (content.kind === "page" && !content.eventId) {
      const live = await this.repository.published(
        organizationId,
        parsed.locale,
        tx,
      );
      if (
        live.some(
          (row) =>
            row.kind === "page" &&
            row.id !== parsed.id &&
            row.revision.slug === draft.slug,
        )
      ) {
        throw new DomainError(
          "SLUG_IN_USE",
          "Another published page already uses this slug in this language.",
          409,
        );
      }
    }
    await tx
      .update(cmsVariant)
      .set({
        publishedRevisionId: revision.id,
        publicationVersion: variant.publicationVersion + 1,
        publishedSlug:
          content.kind === "page" && !content.eventId ? draft.slug : null,
        homeEverPublished:
          variant.homeEverPublished ||
          (content.kind === "page" &&
            !content.eventId &&
            draft.slug === "home"),
      })
      .where(eq(cmsVariant.id, variant.id));
    await this.media.replaceUsage(
      `cms:${variant.id}`,
      organizationId,
      assets,
      tx,
      true,
    );
    await this.record(tx, actor, organizationId, "cms.published", parsed.id);
  }

  async unpublish(actor: TrustedActor, input: unknown): Promise<CmsDetail> {
    const parsed = expectedInput.parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId } = await this.scope.lock(
        actor,
        parsed.id,
        "cms.publish",
        tx,
      );
      const { content, variant } = await this.load(
        organizationId,
        parsed.id,
        parsed.locale,
        tx,
      );
      this.editable(content.archivedAt, variant, parsed.expectedRevisionId);
      await this.references.requireUnusedSection(
        organizationId,
        content,
        parsed.locale,
        tx,
      );
      await tx
        .update(cmsVariant)
        .set({
          publishedRevisionId: null,
          publishedSlug: null,
          publicationVersion: variant.publicationVersion + 1,
        })
        .where(eq(cmsVariant.id, variant.id));
      await this.media.replaceUsage(
        `cms:${variant.id}`,
        organizationId,
        [],
        tx,
        true,
      );
      await this.record(
        tx,
        actor,
        organizationId,
        "cms.unpublished",
        parsed.id,
      );
    });
    return this.detail(actor, parsed.id, parsed.locale);
  }

  async archive(actor: TrustedActor, input: unknown): Promise<CmsDetail> {
    const parsed = expectedInput.parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId } = await this.scope.lock(
        actor,
        parsed.id,
        "cms.publish",
        tx,
      );
      const { content, variant } = await this.load(
        organizationId,
        parsed.id,
        parsed.locale,
        tx,
      );
      this.editable(content.archivedAt, variant, parsed.expectedRevisionId);
      const variants = await this.repository.variants(
        organizationId,
        parsed.id,
        tx,
      );
      for (const item of variants) {
        await this.references.requireUnusedSection(
          organizationId,
          content,
          item.locale,
          tx,
        );
        await tx
          .update(cmsVariant)
          .set({ publishedRevisionId: null, publishedSlug: null })
          .where(eq(cmsVariant.id, item.id));
        await this.media.replaceUsage(
          `cms:${item.id}`,
          organizationId,
          [],
          tx,
          true,
        );
      }
      await tx
        .update(cmsContent)
        .set({ archivedAt: new Date() })
        .where(eq(cmsContent.id, parsed.id));
      await this.record(tx, actor, organizationId, "cms.archived", parsed.id);
    });
    return this.detail(actor, parsed.id, parsed.locale);
  }

  async restore(actor: TrustedActor, input: unknown): Promise<CmsDetail> {
    const parsed = restoreInput.parse(input);
    await this.db.transaction((tx) => this.drafts.restore(actor, parsed, tx));
    return this.detail(actor, parsed.id, parsed.locale);
  }

  async duplicate(actor: TrustedActor, input: unknown): Promise<CmsDetail> {
    const parsed = duplicateInput.parse(input);
    const id = await this.db.transaction(async (tx) => {
      const { organizationId } = await this.scope.lock(
        actor,
        parsed.id,
        "cms.edit",
        tx,
      );
      const { content, revision } = await this.load(
        organizationId,
        parsed.id,
        parsed.locale,
        tx,
      );
      if (isSitePart(content.kind) || content.eventId)
        throw new DomainError(
          "SITE_PART_SINGLETON",
          "Edit or restore this shared or event page instead of duplicating it.",
          422,
        );
      const draft = revisionDto(revision, content.kind);
      await this.references.validateReferences(
        organizationId,
        draft.data,
        parsed.locale,
        false,
        tx,
      );
      await this.media.assertOwnedAssets(
        organizationId,
        contentAssets(draft.data, draft.socialImageId),
        tx,
      );
      const [copy] = await tx
        .insert(cmsContent)
        .values({ organizationId, kind: content.kind })
        .returning();
      await this.revisions.createVariant(
        tx,
        actor,
        organizationId,
        copy.id,
        parsed.locale,
        { ...draft, title: parsed.title, slug: parsed.slug },
      );
      await this.record(tx, actor, organizationId, "cms.duplicated", copy.id);
      return copy.id;
    });
    return this.detail(actor, id, parsed.locale);
  }

  async preview(
    actor: TrustedActor,
    rawId: unknown,
    rawLocale: unknown,
  ): Promise<PublicPage> {
    const { id, locale } = variantInput.parse({ id: rawId, locale: rawLocale });
    const { organizationId } = await this.scope.read(actor, id);
    const { content, revision } = await this.load(organizationId, id, locale);
    return this.publicReader.project(
      organizationId,
      id,
      locale,
      revision,
      content.kind,
      false,
    );
  }

  publicPage(locale: unknown, slug: unknown) {
    return this.publicReader.publicPage(locale, slug);
  }
  async eventPages(actor: TrustedActor, id: string) {
    await this.events.detail(actor, id);
    const scope = await this.authorization.approved(actor);
    return this.repository.list(scope.organizationId, this.db, id);
  }

  /** Scoped staff can read placement without receiving page drafts or editor privileges. */
  async eventParticipation(
    actor: TrustedActor,
    id: string,
    executor: DatabaseExecutor = this.db,
  ) {
    await this.events.detail(actor, id, executor);
    const { organizationId } = await this.authorization.approved(
      actor,
      executor,
    );
    return new CmsEventParticipationReader(
      this.repository,
      this.publicReader,
    ).read(organizationId, id, executor);
  }

  /** Only the event publication reader exposes these projections after visibility/module checks. */
  async publishedEventPages(
    organizationId: string,
    eventId: string,
    locale: CmsLocale,
    executor: DatabaseExecutor = this.db,
  ) {
    const rows = await this.repository.published(
      organizationId,
      locale,
      executor,
      eventId,
    );
    const result = [];
    for (const row of rows) {
      try {
        const page = await this.publicReader.project(
          organizationId,
          row.id,
          locale,
          row.revision,
          row.kind,
          true,
          executor,
        );
        result.push({ moduleKey: row.moduleKey!, page });
      } catch (error) {
        if (!(error instanceof DomainError || error instanceof z.ZodError))
          throw error;
      }
    }
    return result;
  }
  async requireEventLanding(
    organizationId: string,
    eventId: string,
    tx: Transaction,
  ) {
    const rows = await this.repository.published(
      organizationId,
      undefined,
      tx,
      eventId,
    );
    if (!rows.some((row) => row.moduleKey === "website"))
      throw new DomainError(
        "EVENT_LANDING_REQUIRED",
        "Publish a Website page in at least one language before publishing event details.",
        409,
      );
  }
  publicHome(locale: unknown) {
    return this.publicReader.publicHome(locale);
  }
  publicEventsPage(locale: unknown) {
    return this.publicReader.publicEventsPage(locale);
  }
  publicSitemap() {
    return this.publicReader.publicSitemap();
  }
  publicPageCards(locale: unknown) {
    return this.publicReader.pageCards(locale);
  }

  getSite(actor: TrustedActor, locale: unknown) {
    return this.site.get(actor, locale);
  }
  saveSite(actor: TrustedActor, input: unknown) {
    return this.site.save(actor, input);
  }
  publishSite(actor: TrustedActor, input: unknown) {
    return this.site.publish(actor, input);
  }
  publicSite(locale: unknown) {
    return this.site.publicSite(locale);
  }
  previewSite(actor: TrustedActor, locale: unknown) {
    return this.site.preview(actor, locale);
  }
  activateAppearance(actor: TrustedActor, input: unknown) {
    return this.site.activateAppearance(actor, input);
  }
  restoreAppearance(actor: TrustedActor, input: unknown) {
    return this.site.restoreAppearance(actor, input);
  }

  private async load(
    organizationId: string,
    id: string,
    locale: CmsLocale,
    executor: DatabaseExecutor = this.db,
  ) {
    const content = await this.repository.content(organizationId, id, executor);
    const variant = await this.repository.variant(
      organizationId,
      id,
      locale,
      executor,
    );
    if (!content || !variant?.draftRevisionId) this.notFound();
    const revision = await this.repository.revision(
      variant.id,
      variant.draftRevisionId,
      executor,
    );
    if (!revision) this.notFound();
    return { content, variant, revision };
  }

  private editable(
    archivedAt: Date | null,
    variant: Variant,
    expected: string,
  ) {
    if (archivedAt)
      throw new DomainError(
        "CONTENT_ARCHIVED",
        "This content is archived. Duplicate it to create an editable draft.",
        409,
      );
    if (variant.draftRevisionId !== expected) {
      throw new DomainError(
        "REVISION_CONFLICT",
        "Another editor saved this draft. Your changes are preserved; reload before saving again.",
        409,
      );
    }
  }

  private record(
    tx: Transaction,
    actor: TrustedActor,
    organizationId: string,
    action: string,
    targetId: string,
  ) {
    return this.audit.record(tx, {
      organizationId,
      actorUserId: actor.userId,
      action,
      targetId,
    });
  }

  private notFound(): never {
    throw new DomainError(
      "CONTENT_NOT_FOUND",
      "The requested content is unavailable.",
      404,
    );
  }
}
