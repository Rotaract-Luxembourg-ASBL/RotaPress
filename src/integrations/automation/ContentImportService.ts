import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { automationImport } from "../../../db/schema/automation";
import { cmsVariant } from "../../../db/schema/cms";
import type { Database } from "@/infrastructure/database/client";
import {
  DomainError,
  type AuthorizationService,
} from "@/core/authorization/AuthorizationService";
import { AuditRepository } from "@/core/audit/AuditRepository";
import type { CmsService } from "@/features/cms/CmsService";
import { CmsRepository } from "@/features/cms/CmsRepository";
import type { CmsData } from "@/features/cms/cms_schemas";
import type { AutomationPrincipal } from "./AutomationAccess";
import { importPagesInput, importReceiptSchema } from "./import_schemas";

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

export class ContentImportService {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthorizationService,
    private readonly cms: CmsService,
  ) {}

  async create(principal: AutomationPrincipal, input: unknown) {
    const parsed = importPagesInput.parse(input);
    for (const page of parsed.pages) {
      if (
        page.sourceUrl &&
        !principal.sourceOrigins.includes(new URL(page.sourceUrl).origin)
      )
        throw new DomainError(
          "SOURCE_NOT_ALLOWED",
          "This connection cannot use that reference website.",
          403,
        );
    }
    const inputHash = createHash("sha256")
      .update(JSON.stringify(parsed))
      .digest("hex");
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.auth.lock(
        principal.actor,
        "cms.edit",
        tx,
      );
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
            "This request ID is already used. Use a new UUID for a different import.",
            409,
          );
        return importReceiptSchema.parse(previous.receipt);
      }
      const existing = await new CmsRepository(this.db).list(
        organizationId,
        tx,
      );
      const slugs = new Set(
        existing
          .filter((row) => !row.archived && row.kind === "page")
          .map((row) => `${row.locale}:${row.slug}`),
      );
      const pages = [];
      for (const page of parsed.pages) {
        const slugKey = `${page.locale}:${page.slug}`;
        if (slugs.has(slugKey))
          throw new DomainError(
            "IMPORT_SLUG_EXISTS",
            `A page already uses ${page.slug} in ${page.locale}. Choose another slug or edit its existing draft.`,
            409,
          );
        slugs.add(slugKey);
        const id = await this.cms.createDraft(
          principal.actor,
          {
            kind: "page",
            locale: page.locale,
            title: page.title,
            slug: page.slug,
          },
          tx,
        );
        const [variant] = await tx
          .select()
          .from(cmsVariant)
          .where(
            and(
              eq(cmsVariant.contentId, id),
              eq(cmsVariant.locale, page.locale),
            ),
          );
        const data: CmsData = { root: { props: {} }, content: [] };
        for (const section of page.sections) {
          if (section.heading)
            data.content.push({
              type: "Heading",
              props: {
                id: randomUUID(),
                version: 1,
                text: section.heading,
                level: "h2",
              },
            });
          data.content.push({
            type: "RichText",
            props: {
              id: randomUUID(),
              version: 1,
              text: `<p>${escape(section.text).replace(/\n/g, "<br>")}</p>`,
            },
          });
        }
        await this.cms.drafts.save(
          principal.actor,
          {
            id,
            locale: page.locale,
            expectedRevisionId: variant.draftRevisionId,
            title: page.title,
            slug: page.slug,
            description: page.description,
            socialImageId: null,
            data,
          },
          tx,
          "cms.automation.draft.created",
        );
        pages.push({
          id,
          locale: page.locale,
          title: page.title,
          slug: page.slug,
          sourceUrl: page.sourceUrl ?? null,
          reviewUrl: `/admin/website/${id}?locale=${page.locale}`,
        });
      }
      const receipt = importReceiptSchema.parse({
        requestId: parsed.requestId,
        status: "private-drafts",
        pages,
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
        action: "automation.import.created",
        targetId: parsed.requestId,
      });
      return receipt;
    });
  }

  async receipt(principal: AutomationPrincipal, requestId: string) {
    const { organizationId } = await this.auth.require(
      principal.actor,
      "cms.edit",
    );
    const [row] = await this.db
      .select()
      .from(automationImport)
      .where(
        and(
          eq(automationImport.organizationId, organizationId),
          eq(automationImport.requestId, requestId),
        ),
      );
    if (!row)
      throw new DomainError(
        "IMPORT_NOT_FOUND",
        "This import is unavailable.",
        404,
      );
    return importReceiptSchema.parse(row.receipt);
  }
}
