import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { cmsSite } from "../../../db/schema/cms";
import type { Database } from "../../infrastructure/database/client";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
  type DatabaseExecutor,
  type Transaction,
} from "../../core/authorization/AuthorizationService";
import { AuditRepository } from "../../core/audit/AuditRepository";
import { OrganizationRepository } from "../../core/organization/OrganizationRepository";
import { CmsRepository } from "./CmsRepository";
import {
  cmsLocaleSchema,
  defaultSiteSettings,
  siteSettingsSchema,
  type PublicSite,
  type SiteDraft,
  type CmsLocale,
  type SiteSettings,
} from "./cms_schemas";
import { appearanceOf, appearanceSchema } from "./appearance";
import { validateContent } from "./cms_validation";
import { contentAssets } from "./cms_validation";
import type { MediaService } from "../media";
import { siteAssetIds } from "./site_seo";
import { FormService } from "../forms/FormService";
import {
  websiteMenu,
  type WebsitePublicationScope,
} from "./website_publication";

const siteVersionInput = z.strictObject({
  locale: cmsLocaleSchema,
  expectedVersion: z.number().int().min(0),
});
const siteSaveInput = siteVersionInput.extend({ settings: siteSettingsSchema });

export class CmsSiteService {
  private readonly audit = new AuditRepository();
  private readonly organization: OrganizationRepository;
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly repository: CmsRepository,
    private readonly media: MediaService,
  ) {
    this.organization = new OrganizationRepository(db);
  }

  async get(
    actor: TrustedActor,
    rawLocale: unknown,
    executor: DatabaseExecutor = this.db,
  ): Promise<SiteDraft> {
    const locale = cmsLocaleSchema.parse(rawLocale);
    const { organizationId } = await this.authorization.require(
      actor,
      "cms.edit",
      executor,
    );
    const row = await this.repository.site(organizationId, locale, executor);
    return row
      ? {
          version: row.version,
          draft: siteSettingsSchema.parse(row.draft),
          published: row.published
            ? siteSettingsSchema.parse(row.published)
            : null,
          previousAppearance: row.previousAppearance
            ? appearanceSchema.parse(row.previousAppearance)
            : null,
        }
      : {
          version: 0,
          draft: await this.defaults(),
          published: null,
          previousAppearance: null,
        };
  }

  async save(actor: TrustedActor, input: unknown): Promise<SiteDraft> {
    const parsed = siteSaveInput.parse(input);
    await this.db.transaction((tx) => this.saveDraft(actor, parsed, tx));
    return this.get(actor, parsed.locale);
  }

  /** Allows a complete website setup to save content and settings atomically. */
  async saveDraft(
    actor: TrustedActor,
    input: unknown,
    tx: Transaction,
  ): Promise<void> {
    const parsed = siteSaveInput.parse(input);
    const { organizationId } = await this.authorization.lock(
      actor,
      "cms.edit",
      tx,
    );
    const row = await this.repository.site(organizationId, parsed.locale, tx);
    if ((row?.version ?? 0) !== parsed.expectedVersion) {
      throw new DomainError(
        "REVISION_CONFLICT",
        "Website settings changed. Keep your changes and reload before saving.",
        409,
      );
    }
    for (const kind of ["header", "footer"] as const) {
      const id = parsed.settings[`${kind}Id`];
      if (!id) continue;
      const part = await this.repository.content(organizationId, id, tx);
      const variant = await this.repository.variant(
        organizationId,
        id,
        parsed.locale,
        tx,
      );
      if (!part || part.kind !== kind || part.archivedAt || !variant)
        throw new DomainError(
          "SITE_PART_INVALID",
          `Choose an active ${kind} in this language.`,
          422,
        );
    }
    const ids = [
      ...parsed.settings.navigation.flatMap((item) =>
        "pageId" in item ? [item.pageId] : [],
      ),
      ...(parsed.settings.homePageId ? [parsed.settings.homePageId] : []),
      ...(parsed.settings.eventsPageId ? [parsed.settings.eventsPageId] : []),
    ];
    if (parsed.settings.contactFormId)
      await new FormService(this.db, this.authorization).assertOwnedForms(
        organizationId,
        [parsed.settings.contactFormId],
        tx,
      );
    for (const id of new Set(ids)) {
      const content = await this.repository.content(organizationId, id, tx);
      const variant = await this.repository.variant(
        organizationId,
        id,
        parsed.locale,
        tx,
      );
      if (
        !content ||
        content.kind !== "page" ||
        content.eventId !== null ||
        content.archivedAt ||
        !variant
      ) {
        throw new DomainError(
          "PAGE_NOT_FOUND",
          "Choose an active page in this language.",
          422,
        );
      }
    }
    await this.media.replaceUsage(
      `cms-site:${parsed.locale}:draft`,
      organizationId,
      siteAssetIds(parsed.settings),
      tx,
    );
    if (row)
      await tx
        .update(cmsSite)
        .set({ draft: parsed.settings, version: row.version + 1 })
        .where(eq(cmsSite.id, row.id));
    else
      await tx.insert(cmsSite).values({
        organizationId,
        locale: parsed.locale,
        draft: parsed.settings,
      });
    await this.audit.record(tx, {
      organizationId,
      actorUserId: actor.userId,
      action: "cms.site.saved",
    });
  }

  async publish(
    actor: TrustedActor,
    input: unknown,
    scope: WebsitePublicationScope = "website",
  ): Promise<SiteDraft> {
    const parsed = siteVersionInput.parse(input);
    await this.db.transaction((tx) =>
      this.publishDraft(actor, parsed, tx, scope),
    );
    return this.get(actor, parsed.locale);
  }

  /** Shared by settings-only and reviewed whole-website publication. */
  async publishDraft(
    actor: TrustedActor,
    input: unknown,
    tx: Transaction,
    scope: WebsitePublicationScope = "website",
  ): Promise<void> {
    const parsed = siteVersionInput.parse(input);
    const { organizationId } = await this.authorization.lock(
      actor,
      "cms.publish",
      tx,
    );
    const row = await this.repository.site(organizationId, parsed.locale, tx);
    if (!row || row.version !== parsed.expectedVersion) {
      throw new DomainError(
        "REVISION_CONFLICT",
        "Save the latest website settings before publishing.",
        409,
      );
    }
    const saved = siteSettingsSchema.parse(row.draft);
    if (scope === "menu" && !row.published)
      throw new DomainError(
        "WEBSITE_NOT_PUBLISHED",
        "Publish the website once before publishing menu changes separately.",
        422,
      );
    if (scope === "website")
      await this.assertCompatible(organizationId, parsed.locale, tx);
    const previous = row.published
      ? siteSettingsSchema.parse(row.published)
      : await this.defaults();
    const draft =
      scope === "menu" ? { ...previous, ...websiteMenu(saved) } : saved;
    const published = await this.repository.published(
      organizationId,
      parsed.locale,
      tx,
    );
    const publicIds = new Set(
      published.filter((item) => item.kind === "page").map((item) => item.id),
    );
    for (const kind of ["header", "footer"] as const) {
      const id = draft[`${kind}Id`];
      if (id && !published.some((item) => item.id === id && item.kind === kind))
        throw new DomainError(
          "SITE_PART_NOT_PUBLISHED",
          `Publish the selected ${kind} first.`,
          422,
        );
    }
    if (draft.homePageId && !publicIds.has(draft.homePageId)) {
      throw new DomainError(
        "HOME_NOT_PUBLISHED",
        "Publish the chosen home page in this language first.",
        422,
      );
    }
    if (draft.eventsPageId && !publicIds.has(draft.eventsPageId)) {
      throw new DomainError(
        "EVENTS_PAGE_NOT_PUBLISHED",
        "Publish the chosen Events landing page in this language first.",
        422,
      );
    }
    if (
      draft.navigation.some(
        (item) => "pageId" in item && !publicIds.has(item.pageId),
      )
    ) {
      throw new DomainError(
        "NAVIGATION_NOT_PUBLISHED",
        "Publish each navigation target in this language first.",
        422,
      );
    }
    await this.media.replaceUsage(
      `cms-site:${parsed.locale}:published`,
      organizationId,
      siteAssetIds(draft),
      tx,
      true,
    );
    await tx
      .update(cmsSite)
      .set({
        published: draft,
        version: row.version + 1,
        ...(JSON.stringify(appearanceOf(previous)) !==
        JSON.stringify(appearanceOf(draft))
          ? { previousAppearance: appearanceOf(previous) }
          : {}),
      })
      .where(eq(cmsSite.id, row.id));
    await this.audit.record(tx, {
      organizationId,
      actorUserId: actor.userId,
      action:
        scope === "menu" ? "cms.site.menu_published" : "cms.site.published",
    });
  }

  async publicSite(rawLocale: unknown): Promise<PublicSite> {
    const locale = cmsLocaleSchema.parse(rawLocale);
    const organizationId = await this.repository.organizationId();
    const row = organizationId
      ? await this.repository.site(organizationId, locale)
      : null;
    const settings = row?.published
      ? siteSettingsSchema.parse(row.published)
      : await this.defaults();
    return this.project(organizationId, locale, settings);
  }

  async preview(actor: TrustedActor, rawLocale: unknown): Promise<PublicSite> {
    const locale = cmsLocaleSchema.parse(rawLocale);
    const { organizationId } = await this.authorization.require(
      actor,
      "cms.edit",
    );
    const row = await this.repository.site(organizationId, locale);
    const published = row?.published
      ? siteSettingsSchema.parse(row.published)
      : await this.defaults();
    const draft = row ? siteSettingsSchema.parse(row.draft) : published;
    await this.assertCompatible(organizationId, locale, this.db);
    return this.project(
      organizationId,
      locale,
      { ...published, ...appearanceOf(draft), branding: draft.branding },
      true,
    );
  }

  /** Changes appearance only; pending navigation/footer/content never hitch a ride. */
  async activateAppearance(
    actor: TrustedActor,
    input: unknown,
  ): Promise<SiteDraft> {
    const parsed = siteVersionInput.parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "cms.publish",
        tx,
      );
      const row = await this.repository.site(organizationId, parsed.locale, tx);
      if (!row || row.version !== parsed.expectedVersion) this.conflict();
      const draft = siteSettingsSchema.parse(row.draft);
      const published = row.published
        ? siteSettingsSchema.parse(row.published)
        : await this.defaults();
      await this.assertCompatible(organizationId, parsed.locale, tx);
      if (
        JSON.stringify(appearanceOf(published)) ===
        JSON.stringify(appearanceOf(draft))
      )
        return;
      await tx
        .update(cmsSite)
        .set({
          published: { ...published, ...appearanceOf(draft) },
          previousAppearance: appearanceOf(published),
          version: row.version + 1,
        })
        .where(eq(cmsSite.id, row.id));
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "cms.appearance.activated",
      });
    });
    return this.get(actor, parsed.locale);
  }

  /** Restore is a draft operation; activation remains deliberate. */
  async restoreAppearance(
    actor: TrustedActor,
    input: unknown,
  ): Promise<SiteDraft> {
    const parsed = siteVersionInput.parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "cms.edit",
        tx,
      );
      const row = await this.repository.site(organizationId, parsed.locale, tx);
      if (!row || row.version !== parsed.expectedVersion) this.conflict();
      if (!row.previousAppearance)
        throw new DomainError(
          "APPEARANCE_HISTORY_EMPTY",
          "There is no previous appearance to restore.",
          409,
        );
      await tx
        .update(cmsSite)
        .set({
          draft: {
            ...siteSettingsSchema.parse(row.draft),
            ...appearanceSchema.parse(row.previousAppearance),
          },
          version: row.version + 1,
        })
        .where(eq(cmsSite.id, row.id));
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "cms.appearance.restored_to_draft",
      });
    });
    return this.get(actor, parsed.locale);
  }

  private conflict(): never {
    throw new DomainError(
      "REVISION_CONFLICT",
      "Save or reload the latest site settings before changing appearance. Your entered settings are preserved.",
      409,
    );
  }

  private async assertCompatible(
    organizationId: string,
    locale: CmsLocale,
    executor: DatabaseExecutor,
  ) {
    // Both built-in themes render the entire shared block contract. Validate both
    // live and draft content without converting, deleting or resaving any block.
    for (const row of await this.repository.appearanceDocuments(
      organizationId,
      locale,
      executor,
    )) {
      try {
        validateContent(row.data, row.kind);
      } catch (error) {
        if (!(error instanceof z.ZodError || error instanceof DomainError))
          throw error;
        throw new DomainError(
          "THEME_CONTENT_UNSUPPORTED",
          `Appearance cannot change: ${row.eventId ? "an event page" : `"${row.title}"`} contains an unsupported block or version. Its content has been preserved; restore a supported revision or update the application.`,
          422,
        );
      }
    }
  }

  private async project(
    organizationId: string | null,
    locale: CmsLocale,
    settings: SiteSettings,
    preview = false,
  ): Promise<PublicSite> {
    if (organizationId) {
      const ids = siteAssetIds(settings);
      if (preview)
        await this.media.assertOwnedAssets(organizationId, ids, this.db);
      else await this.media.assertPublicAssets(organizationId, ids, this.db);
    }
    const pages = organizationId
      ? await this.repository.published(organizationId, locale)
      : [];
    const features = organizationId
      ? await this.authorization.features.flags(organizationId)
      : null;
    const navigation = settings.navigation.flatMap((item) => {
      if ("systemPage" in item)
        return features?.[item.systemPage]
          ? [
              {
                label: item.label,
                href:
                  item.systemPage === "calendar"
                    ? "/calendar"
                    : `/events?locale=${locale}`,
              },
            ]
          : [];
      const page = pages.find(
        (entry) => entry.id === item.pageId && entry.kind === "page",
      );
      if (page && page.id === settings.eventsPageId)
        return features?.events
          ? [{ label: item.label, href: `/events?locale=${locale}` }]
          : [];
      return page
        ? [
            {
              label: item.label,
              href: `/pages/${locale}/${page.revision.slug}`,
            },
          ]
        : [];
    });
    const parts = { header: null, footer: null } as Pick<
      PublicSite,
      "header" | "footer"
    >;
    for (const kind of ["header", "footer"] as const) {
      const chosenId = settings[`${kind}Id`];
      // Legacy shared parts retain their automatic default. Kit alternatives
      // become shared only after an explicit site-settings publication.
      const row = pages.find(
        (item) =>
          item.kind === kind &&
          (chosenId
            ? item.id === chosenId
            : !validateContent(item.revision.data, kind).root.props.kit),
      );
      if (row && organizationId) {
        const data = validateContent(row.revision.data, kind);
        await this.media.assertPublicAssets(
          organizationId,
          contentAssets(data),
          this.db,
        );
        parts[kind] = data;
      }
    }
    return {
      ...parts,
      branding: settings.branding,
      seo: settings.seo,
      eventsPageId: settings.eventsPageId,
      navigation,
      footerText: settings.footerText,
      socialLinks: settings.socialLinks,
      ...appearanceOf(settings),
    };
  }

  private async defaults() {
    const identity = await this.organization.publicIdentity();
    return {
      ...structuredClone(defaultSiteSettings),
      accentColor: identity?.accentColor ?? defaultSiteSettings.accentColor,
    };
  }
}
