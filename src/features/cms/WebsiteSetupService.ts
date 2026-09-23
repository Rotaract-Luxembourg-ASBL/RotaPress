import "server-only";
import { OrganizationRepository } from "@/core/organization/OrganizationRepository";
import { z } from "zod";
import type { Database } from "@/infrastructure/database/client";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
  type Transaction,
} from "@/core/authorization/AuthorizationService";
import { AuditRepository } from "@/core/audit/AuditRepository";
import type { MediaService } from "../media/MediaService";
import type { CmsService } from "./CmsService";
import { CmsRepository } from "./CmsRepository";
import { CmsSiteService } from "./CmsSiteService";
import type { CmsKitService } from "./kits/CmsKitService";
import { kitIdSchema, kitRecipes, kits } from "./kits/catalogue";
import {
  cmsLocaleSchema,
  type SiteSettings,
  type CmsLocale,
} from "./cms_schemas";
import type { WebsiteWorkspace } from "./website_setup_schemas";
import { WebsitePreviewService } from "./WebsitePreviewService";
import { FormService } from "../forms/FormService";
import { WebsitePublicationReviewService } from "./WebsitePublicationReviewService";
import { websitePublicationItems } from "./website_publication";

const versionInput = z.strictObject({
  locale: cmsLocaleSchema,
  expectedVersion: z.number().int().min(0),
  confirmed: z.literal(true),
});
const templateInput = versionInput.extend({ kitId: kitIdSchema });
const publishInput = versionInput
  .extend({
    scope: z.enum(["website", "menu"]).default("website"),
    pages: z
      .array(z.strictObject({ id: z.uuid(), expectedRevisionId: z.uuid() }))
      .max(200)
      .refine(
        (pages) => new Set(pages.map((page) => page.id)).size === pages.length,
      ),
  })
  .refine((input) => input.scope === "menu" || input.pages.length > 0);

/** One draft website, composed from the existing CMS identities and revision services. */
export class WebsiteSetupService {
  private readonly repository: CmsRepository;
  private readonly site: CmsSiteService;
  private readonly previews: WebsitePreviewService;
  private readonly publicationReview: WebsitePublicationReviewService;
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    media: MediaService,
    private readonly cms: CmsService,
    private readonly kits: CmsKitService,
  ) {
    this.repository = new CmsRepository(db);
    this.site = new CmsSiteService(db, authorization, this.repository, media);
    this.publicationReview = new WebsitePublicationReviewService(
      db,
      authorization,
      media,
    );
    this.previews = new WebsitePreviewService(
      cms,
      authorization,
      new OrganizationRepository(db),
    );
  }

  async workspace(
    actor: TrustedActor,
    rawLocale: unknown,
  ): Promise<WebsiteWorkspace> {
    const locale = cmsLocaleSchema.parse(rawLocale);
    const [site, contents] = await Promise.all([
      this.site.get(actor, locale),
      this.cms.list(actor),
    ]);
    const setup = site.draft.templateSetup;
    const selected = setup?.installations.find(
      (item) => item.kitId === setup.selectedKitId,
    );
    return {
      site,
      contents: contents.filter((item) => item.locale === locale),
      selection: selected
        ? {
            kitId: selected.kitId,
            contentIds: selected.recipes
              .filter((item) =>
                contents.some(
                  (content) =>
                    content.id === item.id &&
                    content.locale === locale &&
                    !content.archived,
                ),
              )
              .map((item) => item.id),
          }
        : null,
    };
  }

  async useTemplate(
    actor: TrustedActor,
    input: unknown,
  ): Promise<WebsiteWorkspace> {
    const parsed = templateInput.parse(input);
    const template = kits[parsed.kitId];
    await this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "cms.edit",
        tx,
      );
      const current = await this.site.get(actor, parsed.locale, tx);
      if (current.version !== parsed.expectedVersion) this.conflict();
      const installations = [
        ...(current.draft.templateSetup?.installations ?? []),
      ];
      let selected = installations.find((item) => item.kitId === parsed.kitId);
      let contactFormId = current.draft.contactFormId;
      let activeIds: Set<string>;
      if (selected) {
        // A current setup may intentionally omit an archived optional page.
        if (current.draft.templateSetup?.selectedKitId === parsed.kitId) return;
        activeIds = await this.assertRecipes(
          organizationId,
          parsed.locale,
          selected.recipes,
          tx,
        );
      } else {
        const access = await this.authorization.require(actor, "cms.edit", tx);
        if (
          access.capabilities.includes("forms.edit") &&
          (await this.authorization.features.enabled(
            organizationId,
            "forms",
            tx,
          ))
        ) {
          const forms = new FormService(this.db, this.authorization);
          if (contactFormId)
            await forms.assertOwnedForms(organizationId, [contactFormId], tx);
          else
            contactFormId = (
              await forms.createDraft(
                actor,
                {
                  kind: "contact",
                  templateId: "contact",
                  title: "Contact the club",
                },
                tx,
              )
            ).id;
        }
        const imported = await this.kits.importDrafts(
          actor,
          {
            kitId: parsed.kitId,
            locale: parsed.locale,
            namespace: parsed.kitId,
            recipes: [...template.websiteRecipes],
            confirmed: true,
            ...(contactFormId ? { contactFormId } : {}),
          },
          tx,
          { titlePrefix: "", cleanSlugs: true },
        );
        if (imported.kept)
          throw new DomainError(
            "TEMPLATE_COLLISION",
            "A template path is already in use. Your existing pages were kept; try again.",
            409,
          );
        selected = {
          kitId: parsed.kitId,
          recipes: imported.items.map(({ recipe, id }) => ({ recipe, id })),
        };
        installations.push(selected);
        activeIds = new Set(selected.recipes.map((item) => item.id));
      }
      const id = (recipe: string) =>
        selected!.recipes.find((item) => item.recipe === recipe)?.id ?? "";
      const settings: SiteSettings = {
        ...current.draft,
        contactFormId,
        themeId: parsed.kitId,
        homePageId: id("home"),
        eventsPageId: activeIds.has(id("events")) ? id("events") : null,
        headerId: id("header"),
        footerId: id("footer"),
        navigation: template.menuRecipes
          .filter((recipe) => activeIds.has(id(recipe)))
          .map((recipe) => ({
            pageId: id(recipe),
            label: kitRecipes.find((item) => item.id === recipe)!.name,
          })),
        templateSetup: { selectedKitId: parsed.kitId, installations },
      };
      await this.site.saveDraft(
        actor,
        { locale: parsed.locale, expectedVersion: current.version, settings },
        tx,
      );
      await new AuditRepository().record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "cms.website.template_selected",
      });
    });
    return this.workspace(actor, parsed.locale);
  }

  async publish(
    actor: TrustedActor,
    input: unknown,
  ): Promise<WebsiteWorkspace> {
    const parsed = publishInput.parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "cms.publish",
        tx,
      );
      const current = await this.site.get(actor, parsed.locale, tx);
      if (current.version !== parsed.expectedVersion) this.conflict();
      if (parsed.scope === "menu") {
        const contents = (
          await this.repository.list(organizationId, tx)
        ).filter((item) => item.locale === parsed.locale);
        const required = websitePublicationItems(
          { site: current, contents, selection: null },
          "menu",
        );
        if (
          parsed.pages.length !== required.length ||
          required.some(
            (item) => !parsed.pages.some((page) => page.id === item.id),
          )
        )
          throw new DomainError(
            "WEBSITE_REVIEW_INCOMPLETE",
            "Review the current homepage and menu targets before publishing the menu.",
            409,
          );
        for (const item of required) {
          if (!item.publishedRevisionId)
            throw new DomainError(
              "NAVIGATION_NOT_PUBLISHED",
              `Publish “${item.title}” first, or choose Entire website.`,
              422,
            );
          if (
            parsed.pages.find((page) => page.id === item.id)!
              .expectedRevisionId !== item.publishedRevisionId
          )
            this.conflict();
        }
        await this.site.publishDraft(
          actor,
          { locale: parsed.locale, expectedVersion: current.version },
          tx,
          "menu",
        );
        return;
      }
      const setup = current.draft.templateSetup;
      const selected = setup?.installations.find(
        (item) => item.kitId === setup.selectedKitId,
      );
      const activeIds = new Set(
        (await this.repository.list(organizationId, tx))
          .filter((item) => item.locale === parsed.locale && !item.archived)
          .map((item) => item.id),
      );
      const required = new Set(
        [
          ...(selected?.recipes
            .filter((item) => activeIds.has(item.id))
            .map((item) => item.id) ?? []),
          current.draft.homePageId,
          current.draft.eventsPageId,
          current.draft.headerId,
          current.draft.footerId,
          ...current.draft.navigation.flatMap((item) =>
            "pageId" in item ? [item.pageId] : [],
          ),
        ].filter((id): id is string => Boolean(id)),
      );
      const reviewed = new Set(parsed.pages.map((page) => page.id));
      if ([...required].some((id) => !reviewed.has(id)))
        throw new DomainError(
          "WEBSITE_REVIEW_INCOMPLETE",
          "Review the selected website pages, header, footer and menu targets together before publishing.",
          409,
        );
      for (const page of parsed.pages) {
        const content = await this.repository.content(
          organizationId,
          page.id,
          tx,
        );
        if (
          !content ||
          content.eventId ||
          content.archivedAt ||
          content.kind === "section"
        )
          throw new DomainError(
            "WEBSITE_PAGE_INVALID",
            "Choose active club website pages and shared parts only.",
            422,
          );
        await this.cms.publishRevision(
          actor,
          { ...page, locale: parsed.locale },
          tx,
        );
      }
      // Referenced pages are published earlier in this transaction, never through separate HTTP calls.
      await this.site.publishDraft(
        actor,
        { locale: parsed.locale, expectedVersion: current.version },
        tx,
      );
      await new AuditRepository().record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "cms.website.published",
      });
    });
    return this.workspace(actor, parsed.locale);
  }

  preview(actor: TrustedActor, input: unknown) {
    return this.previews.selected(actor, input);
  }

  async reviewPublication(
    actor: TrustedActor,
    rawLocale: unknown,
    rawScope: unknown,
  ) {
    await this.authorization.require(actor, "cms.publish");
    const locale = cmsLocaleSchema.parse(rawLocale);
    const scope = z.enum(["website", "menu"]).parse(rawScope);
    return this.publicationReview.read(
      actor,
      await this.workspace(actor, locale),
      locale,
      scope,
    );
  }
  previewTemplate(actor: TrustedActor, input: unknown) {
    return this.previews.template(actor, input);
  }

  private async assertRecipes(
    organizationId: string,
    locale: CmsLocale,
    recipes: { recipe: string; id: string }[],
    tx: Transaction,
  ) {
    if (
      // Older installations keep their saved recipes when the catalogue grows.
      ["home", "header", "footer"].some(
        (recipe) => !recipes.some((item) => item.recipe === recipe),
      )
    )
      throw new DomainError(
        "TEMPLATE_SETUP_INCOMPLETE",
        "This saved template setup is incomplete. Your existing pages have been retained.",
        409,
      );
    const activeIds = new Set<string>();
    for (const item of recipes) {
      const content = await this.repository.content(
        organizationId,
        item.id,
        tx,
      );
      const variant = await this.repository.variant(
        organizationId,
        item.id,
        locale,
        tx,
      );
      const kind =
        item.recipe === "header" || item.recipe === "footer"
          ? item.recipe
          : "page";
      if (
        !content ||
        content.eventId ||
        content.kind !== kind ||
        !variant?.draftRevisionId ||
        (content.archivedAt &&
          ["home", "header", "footer"].includes(item.recipe))
      )
        throw new DomainError(
          "TEMPLATE_CONTENT_UNAVAILABLE",
          "The saved template homepage or a required part is unavailable. Choose an active homepage and shared parts in Website settings.",
          409,
        );
      if (!content.archivedAt) activeIds.add(item.id);
    }
    return activeIds;
  }

  private conflict(): never {
    throw new DomainError(
      "REVISION_CONFLICT",
      "Website setup changed. Reload and review the current website before continuing.",
      409,
    );
  }
}
