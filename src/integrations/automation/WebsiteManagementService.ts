import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { automationImport } from "../../../db/schema/automation";
import type { Database } from "@/infrastructure/database/client";
import {
  DomainError,
  type AuthorizationService,
  type Transaction,
} from "@/core/authorization/AuthorizationService";
import { AuditRepository } from "@/core/audit/AuditRepository";
import type { CmsService } from "@/features/cms/CmsService";
import { CmsRepository } from "@/features/cms/CmsRepository";
import { duplicateInput, restoreInput } from "@/features/cms/cms_commands";
import { isSitePart } from "@/features/cms/cms_schemas";
import type { AutomationPrincipal } from "./AutomationAccess";
import { importReceiptSchema } from "./import_schemas";
import { requireNonExecutableContent } from "./website_content_policy";
import {
  websiteCopyInput,
  websiteSettingsInput,
  websitePublishInput,
  websiteSettingsPublishInput,
} from "./website_management_schemas";

/** Uses existing CMS writers and explicit grants for draft and publication actions. */
export class WebsiteManagementService {
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly cms: CmsService,
  ) {}

  async duplicate(principal: AutomationPrincipal, input: unknown) {
    this.requireGrant(principal, "website:manage");
    const parsed = websiteCopyInput.parse(input);
    const inputHash = createHash("sha256")
      .update(JSON.stringify({ operation: "website_duplicate", ...parsed }))
      .digest("hex");
    return this.db.transaction(async (tx) => {
      const organizationId = await this.lock(principal, tx);
      const [previous] = await tx
        .select()
        .from(automationImport)
        .where(
          and(
            eq(automationImport.organizationId, organizationId),
            eq(automationImport.requestId, parsed.requestId),
          ),
        );
      if (previous) {
        if (
          previous.inputHash !== inputHash ||
          previous.createdBy !== principal.actor.userId
        )
          throw new DomainError(
            "IMPORT_CONFLICT",
            "This request ID is already used. Use a new UUID for a different copy.",
            409,
          );
        return importReceiptSchema.parse(previous.receipt);
      }

      const source = await this.cms.revision(
        principal.actor,
        {
          id: parsed.id,
          locale: parsed.locale,
          revisionId: parsed.expectedRevisionId,
        },
        tx,
      );
      if (source.draftRevisionId !== parsed.expectedRevisionId)
        throw new DomainError(
          "REVISION_CONFLICT",
          "The source draft changed. Read its current revision before copying.",
          409,
        );
      if (isSitePart(source.kind) || source.eventOwned)
        throw new DomainError(
          "SITE_PART_SINGLETON",
          "Edit or restore shared site parts. Use event preparation to copy event pages.",
          422,
        );
      requireNonExecutableContent(source.revision.data);
      const repository = new CmsRepository(this.db);
      const existing = await repository.list(organizationId, tx);
      if (
        existing.some(
          (item) =>
            item.kind === source.kind &&
            item.locale === parsed.locale &&
            item.slug === parsed.slug &&
            !item.archived,
        )
      )
        throw new DomainError(
          "IMPORT_SLUG_EXISTS",
          "Content already uses this slug in this language. Choose a different slug.",
          409,
        );

      const id = await this.cms.createDraft(
        principal.actor,
        {
          kind: source.kind,
          locale: parsed.locale,
          title: parsed.title,
          slug: parsed.slug,
        },
        tx,
      );
      const variant = await repository.variant(
        organizationId,
        id,
        parsed.locale,
        tx,
      );
      if (!variant?.draftRevisionId)
        throw new DomainError(
          "CONTENT_NOT_FOUND",
          "The copied draft is unavailable.",
          404,
        );
      const { description, socialImageId, data } = source.revision;
      await this.cms.drafts.save(
        principal.actor,
        {
          id,
          locale: parsed.locale,
          expectedRevisionId: variant.draftRevisionId,
          title: parsed.title,
          slug: parsed.slug,
          description,
          socialImageId,
          data,
        },
        tx,
        "cms.automation.draft.copied",
      );
      const receipt = importReceiptSchema.parse({
        requestId: parsed.requestId,
        status: "private-drafts",
        pages: [
          {
            id,
            locale: parsed.locale,
            title: parsed.title,
            slug: parsed.slug,
            sourceUrl: null,
            reviewUrl: `/admin/website/${id}?locale=${parsed.locale}`,
          },
        ],
      });
      await tx.insert(automationImport).values({
        organizationId,
        requestId: parsed.requestId,
        createdBy: principal.actor.userId,
        inputHash,
        receipt,
      });
      await new AuditRepository().record(tx, {
        organizationId,
        actorUserId: principal.actor.userId,
        action: "automation.website.copied",
        targetId: id,
      });
      return receipt;
    });
  }

  async restore(principal: AutomationPrincipal, input: unknown) {
    this.requireGrant(principal, "website:manage");
    const parsed = restoreInput.parse(input);
    await this.db.transaction(async (tx) => {
      await this.lock(principal, tx);
      const source = await this.cms.revision(
        principal.actor,
        {
          id: parsed.id,
          locale: parsed.locale,
          revisionId: parsed.revisionId,
        },
        tx,
      );
      requireNonExecutableContent(source.revision.data);
      const { title, slug, description, socialImageId, data } = source.revision;
      await this.cms.drafts.save(
        principal.actor,
        {
          id: parsed.id,
          locale: parsed.locale,
          expectedRevisionId: parsed.expectedRevisionId,
          title,
          slug,
          description,
          socialImageId,
          data,
        },
        tx,
        "cms.automation.draft.restored",
      );
    });
    return this.cms.detail(principal.actor, parsed.id, parsed.locale);
  }

  async addLocale(principal: AutomationPrincipal, input: unknown) {
    this.requireGrant(principal, "website:manage");
    const parsed = duplicateInput.parse(input);
    await this.requireCurrentClub(principal);
    // The CMS locks and creates only a missing language; retries cannot overwrite it.
    return this.cms.addLocale(principal.actor, parsed);
  }

  async saveSettings(principal: AutomationPrincipal, input: unknown) {
    this.requireGrant(principal, "website:settings");
    const parsed = websiteSettingsInput.parse(input);
    await this.requireCurrentClub(principal);
    const current = await this.cms.getSite(principal.actor, parsed.locale);
    if (current.version !== parsed.expectedVersion)
      throw new DomainError(
        "REVISION_CONFLICT",
        "Website settings changed. Read the current version before saving.",
        409,
      );
    if (
      JSON.stringify(current.draft.templateSetup ?? null) !==
      JSON.stringify(parsed.settings.templateSetup ?? null)
    )
      throw new DomainError(
        "AUTOMATION_TEMPLATE_CHANGE_DISABLED",
        "Preserve installed template records from website_context. Use Website Templates to change the installation.",
        422,
      );
    return this.cms.saveSite(principal.actor, parsed);
  }

  async publish(principal: AutomationPrincipal, input: unknown) {
    this.requireGrant(principal, "website:publish");
    const inputValues = websitePublishInput.parse(input);
    const parsed = {
      id: inputValues.id,
      locale: inputValues.locale,
      expectedRevisionId: inputValues.expectedRevisionId,
    };
    await this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        principal.actor,
        "cms.publish",
        tx,
      );
      this.requireOrganization(principal, organizationId);
      const source = await this.cms.revision(
        principal.actor,
        {
          id: parsed.id,
          locale: parsed.locale,
          revisionId: parsed.expectedRevisionId,
        },
        tx,
      );
      requireNonExecutableContent(source.revision.data);
      await this.cms.publishRevision(principal.actor, parsed, tx);
    });
    return this.cms.detail(principal.actor, parsed.id, parsed.locale);
  }

  async publishSettings(principal: AutomationPrincipal, input: unknown) {
    this.requireGrant(principal, "website:publish");
    const parsed = websiteSettingsPublishInput.parse(input);
    const { organizationId } = await this.authorization.require(
      principal.actor,
      "cms.publish",
    );
    this.requireOrganization(principal, organizationId);
    return this.cms.publishSite(
      principal.actor,
      {
        locale: parsed.locale,
        expectedVersion: parsed.expectedVersion,
      },
      parsed.scope === "menu" ? "menu" : "website",
    );
  }

  private requireGrant(
    principal: AutomationPrincipal,
    scope: "website:manage" | "website:settings" | "website:publish",
  ) {
    if (!principal.scopes.includes(scope))
      throw new DomainError(
        "AUTOMATION_SCOPE_REQUIRED",
        `This connection needs ${scope}.`,
        403,
      );
  }

  private async requireCurrentClub(principal: AutomationPrincipal) {
    const { organizationId } = await this.authorization.require(
      principal.actor,
      "cms.edit",
    );
    this.requireOrganization(principal, organizationId);
  }

  private async lock(principal: AutomationPrincipal, tx: Transaction) {
    const { organizationId } = await this.authorization.lock(
      principal.actor,
      "cms.edit",
      tx,
    );
    this.requireOrganization(principal, organizationId);
    return organizationId;
  }

  private requireOrganization(
    principal: AutomationPrincipal,
    organizationId: string,
  ) {
    if (principal.organizationId !== organizationId)
      throw new DomainError(
        "AUTOMATION_ORGANIZATION_CHANGED",
        "Create a connection for the current club.",
        403,
      );
  }
}
