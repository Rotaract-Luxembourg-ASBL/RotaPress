import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { cmsContent, cmsVariant } from "../../../../db/schema/cms";
import type { Database } from "@/infrastructure/database/client";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
  type Transaction,
} from "@/core/authorization/AuthorizationService";
import { AuditRepository } from "@/core/audit/AuditRepository";
import type { MediaService } from "../../media";
import type { CmsService } from "../CmsService";
import { CmsRepository } from "../CmsRepository";
import { CmsRevisionWriter } from "../CmsRevisionWriter";
import {
  cmsLocaleSchema,
  cmsDataSchema,
  slugSchema,
  type CmsKind,
  type PublicSite,
} from "../cms_schemas";
import { contentAssets, validateContent } from "../cms_validation";
import { kitIdSchema, recipeIdSchema, kitRecipes, kits } from "./catalogue";
import { copyKitRecipe } from "./recipes";
import { defaultTemplateImages, templateImage } from "./template_images";
import type { RecipeContext } from "./recipe_helpers";
import {
  demoProject,
  demoProjects,
  demoEvents,
  demoEventPage,
} from "./demo_content";
import type { FormService } from "../../forms/FormService";
import { OrganizationRepository } from "@/core/organization/OrganizationRepository";

export const kitImportSchema = z.strictObject({
  kitId: kitIdSchema,
  locale: cmsLocaleSchema,
  namespace: slugSchema.max(45),
  recipes: z
    .array(recipeIdSchema)
    .min(1)
    .max(recipeIdSchema.options.length)
    .refine((ids) => new Set(ids).size === ids.length),
  assets: z.array(z.uuid()).max(12).optional(),
  contactFormId: z.uuid().optional(),
  membershipFormId: z.uuid().optional(),
  demonstration: z.boolean().default(false),
  confirmed: z.literal(true),
});
const previewSchema = kitImportSchema
  .pick({ kitId: true, locale: true, namespace: true })
  .extend({
    recipe: z.union([
      recipeIdSchema,
      z.enum(["project-detail-2", "project-detail-3", "event-detail-2"]),
    ]),
  });
const kindOf = (recipe: string): CmsKind =>
  recipe === "header" || recipe === "footer" ? recipe : "page";

/** Batch creation uses existing content/revision storage and never changes live pointers. */
export class CmsKitService {
  private readonly repository: CmsRepository;
  private readonly writer: CmsRevisionWriter;
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly media: MediaService,
    private readonly cms: CmsService,
    private readonly forms: FormService,
    private readonly local: boolean,
  ) {
    this.repository = new CmsRepository(db);
    this.writer = new CmsRevisionWriter(media);
  }
  async import(actor: TrustedActor, input: unknown) {
    return this.db.transaction((tx) => this.importDrafts(actor, input, tx));
  }

  /** Reused by complete website setup inside the same transaction as its settings. */
  async importDrafts(
    actor: TrustedActor,
    input: unknown,
    tx: Transaction,
    options: { titlePrefix?: string; cleanSlugs?: boolean } = {},
  ) {
    const parsed = kitImportSchema.parse(input);
    const titlePrefix = options.titlePrefix ?? kits[parsed.kitId].name;
    if (parsed.demonstration && !this.local)
      throw new DomainError(
        "LOCAL_ONLY",
        "Demonstration imports are available only on a local installation.",
        403,
      );
    const { organizationId } = await this.authorization.lock(
      actor,
      "cms.edit",
      tx,
    );
    await this.media.assertOwnedAssets(organizationId, parsed.assets ?? [], tx);
    const assets = parsed.assets ?? defaultTemplateImages;
    await this.forms.assertOwnedForms(
      organizationId,
      [parsed.contactFormId, parsed.membershipFormId].filter(
        (id): id is string => Boolean(id),
      ),
      tx,
    );
    const existing = await this.repository.list(organizationId, tx);
    // Complete website setup allocates readable paths under the organization lock.
    // A pending rename must not release the still-published path for a new page.
    const reserved = new Set(
      existing
        .filter((item) => item.locale === parsed.locale)
        .map((item) => item.slug),
    );
    if (options.cleanSlugs) {
      const published = await tx
        .select({ slug: cmsVariant.publishedSlug })
        .from(cmsVariant)
        .where(
          and(
            eq(cmsVariant.organizationId, organizationId),
            eq(cmsVariant.locale, parsed.locale),
          ),
        );
      for (const { slug } of published) if (slug) reserved.add(slug);
    }
    const requests = parsed.recipes.map((recipe) => ({ recipe, index: 0 }));
    if (parsed.demonstration && parsed.recipes.includes("project-detail"))
      requests.push(
        { recipe: "project-detail", index: 1 },
        { recipe: "project-detail", index: 2 },
      );
    if (parsed.demonstration && parsed.recipes.includes("event-detail"))
      requests.push({ recipe: "event-detail", index: 1 });
    const plan = requests.map(({ recipe, index }) => {
      let slug = options.cleanSlugs
        ? recipe
        : `${parsed.namespace}-${recipe}${index ? `-${index + 1}` : ""}`;
      if (options.cleanSlugs) {
        let suffix = 2;
        while (reserved.has(slug)) slug = `${recipe}-${suffix++}`;
        reserved.add(slug);
      }
      const prior =
        !options.cleanSlugs &&
        existing.find(
          (item) => item.locale === parsed.locale && item.slug === slug,
        );
      return {
        recipe,
        index,
        slug,
        id: prior ? prior.id : crypto.randomUUID(),
        kept: Boolean(prior),
      };
    });
    const links = Object.fromEntries(
      plan
        .filter((item) => !item.index)
        .map((item) => [item.recipe, `/pages/${parsed.locale}/${item.slug}`]),
    );
    const context: RecipeContext = {
      kit: parsed.kitId,
      demo: parsed.demonstration,
      assets,
      links,
      projectIds: plan
        .filter((item) => item.recipe === "project-detail")
        .map((item) => item.id),
      contactFormId: parsed.contactFormId,
      membershipFormId: parsed.membershipFormId,
      timezone: (
        await new OrganizationRepository(this.db).settings(organizationId, tx)
      )?.timezone,
      calendarEnabled: await this.authorization.features.enabled(
        organizationId,
        "calendar",
        tx,
      ),
    };
    for (const item of plan) {
      if (item.kept) continue;
      const kind = kindOf(item.recipe);
      const variantContext = {
        ...context,
        assets: item.index
          ? [...assets.slice(item.index), ...assets.slice(0, item.index)]
          : assets,
      };
      const recipeData = copyKitRecipe(item.recipe, variantContext);
      const data = validateContent(
        parsed.demonstration && item.recipe === "project-detail"
          ? demoProject(recipeData, item.index)
          : parsed.demonstration && item.recipe === "event-detail"
            ? demoEventPage(recipeData, item.index)
            : recipeData,
        kind,
      );
      await this.media.assertOwnedAssets(
        organizationId,
        contentAssets(data),
        tx,
      );
      await tx.insert(cmsContent).values({ id: item.id, organizationId, kind });
      await this.writer.createVariant(
        tx,
        actor,
        organizationId,
        item.id,
        parsed.locale,
        {
          title:
            parsed.demonstration && item.recipe === "project-detail"
              ? demoProjects[item.index].title
              : `${titlePrefix ? `${titlePrefix} · ` : ""}${kitRecipes.find((recipe) => recipe.id === item.recipe)!.name}`,
          slug: item.slug,
          description:
            item.recipe === "project-detail"
              ? demoProjects[item.index].description
              : "",
          socialImageId:
            kind === "page" && !templateImage(variantContext.assets[0] ?? "")
              ? (variantContext.assets[0] ?? null)
              : null,
          data,
        },
      );
    }
    await new AuditRepository().record(tx, {
      organizationId,
      actorUserId: actor.userId,
      action: "cms.kit.imported",
    });
    return {
      items: plan,
      created: plan.filter((item) => !item.kept).length,
      kept: plan.filter((item) => item.kept).length,
    };
  }

  async preview(actor: TrustedActor, input: unknown) {
    const parsed = previewSchema.parse(input);
    await this.authorization.require(actor, "cms.edit");
    const existing = await this.cms.list(actor);
    const find = (recipe: string) =>
      existing.find(
        (item) =>
          item.locale === parsed.locale &&
          item.slug === `${parsed.namespace}-${recipe}` &&
          !item.archived,
      );
    const chosen = find(parsed.recipe);
    if (!chosen)
      throw new DomainError(
        "KIT_PAGE_MISSING",
        "Add this kit's editable drafts before previewing it.",
        404,
      );
    const page = await this.cms.preview(actor, chosen.id, parsed.locale);
    const publicSite = await this.cms.publicSite(parsed.locale);
    const parts: Pick<PublicSite, "header" | "footer"> = {
      header: publicSite.header,
      footer: publicSite.footer,
    };
    for (const kind of ["header", "footer"] as const) {
      const part = find(kind);
      if (part?.kind === kind)
        parts[kind] = (
          await this.cms.preview(actor, part.id, parsed.locale)
        ).data;
    }
    const href = (recipe: string) =>
      `/admin/website/kits/${parsed.kitId}/preview?namespace=${parsed.namespace}&recipe=${recipe}&locale=${parsed.locale}`;
    const draftLinks = new Map(
      existing
        .filter(
          (item) =>
            item.locale === parsed.locale &&
            item.slug.startsWith(`${parsed.namespace}-`) &&
            !item.archived,
        )
        .map((item) => [
          `/pages/${parsed.locale}/${item.slug}`,
          href(item.slug.slice(parsed.namespace.length + 1)),
        ]),
    );
    // Rewrite known links only in this private projection; saved content is untouched.
    const previewData = (data: typeof page.data) =>
      cmsDataSchema.parse(
        JSON.parse(
          JSON.stringify(data, (_key, value: unknown) =>
            typeof value === "string"
              ? (draftLinks.get(value) ?? value)
              : value,
          ),
        ),
      );
    page.data = previewData(page.data);
    for (const kind of ["header", "footer"] as const)
      if (parts[kind]) parts[kind] = previewData(parts[kind]);
    const navigation = [
      "home",
      "about",
      "projects",
      "events",
      "join",
      "contact",
    ].flatMap((recipe) =>
      find(recipe)
        ? [
            {
              label: kitRecipes.find((item) => item.id === recipe)!.name,
              href: href(recipe),
            },
          ]
        : [],
    );
    const cards = [];
    for (const recipe of [
      "project-detail",
      "project-detail-2",
      "project-detail-3",
    ]) {
      const project = find(recipe);
      if (!project) continue;
      const detail = await this.cms.preview(actor, project.id, parsed.locale);
      cards.push({
        id: detail.id,
        title: detail.title,
        description: detail.description,
        assetId: detail.socialImageId,
        href: href(recipe),
      });
    }
    const previewEvents =
      page.data.root.props.demonstration && find("event-detail")
        ? demoEvents(
            ["event-detail", "event-detail-2"]
              .filter((recipe) => find(recipe))
              .map(href),
            cards.flatMap((item) => item.assetId ?? []),
          )
        : undefined;
    return {
      page,
      site: {
        ...publicSite,
        ...parts,
        navigation: navigation.length ? navigation : publicSite.navigation,
        homeHref: find("home") ? href("home") : "/",
        themeId: parsed.kitId,
        accentColor: null,
        font: null,
      } satisfies PublicSite,
      cards,
      sharedParts: (["header", "footer"] as const).filter(
        (kind) => find(kind)?.kind === kind,
      ),
      previewEvents,
      demonstration: Boolean(page.data.root.props.demonstration),
      namespace: parsed.namespace,
      kitId: parsed.kitId,
    };
  }
}
