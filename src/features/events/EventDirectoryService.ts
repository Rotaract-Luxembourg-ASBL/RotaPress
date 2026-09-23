import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { cmsSite } from "../../../db/schema/cms";
import type { Database } from "../../infrastructure/database/client";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import { AuditRepository } from "../../core/audit/AuditRepository";
import { CmsRepository } from "../cms/CmsRepository";
import {
  cmsLocaleSchema,
  defaultSiteSettings,
  siteSettingsSchema,
} from "../cms/cms_schemas";
import type { MediaService } from "../media/MediaService";
import {
  defaultEventDirectoryDesign,
  eventDirectoryDesignSchema,
  type EventDirectoryWorkspace,
} from "./event_directory";

const versionInput = z.strictObject({
  locale: cmsLocaleSchema,
  expectedVersion: z.number().int().min(0),
});
const saveInput = versionInput.extend({ design: eventDirectoryDesignSchema });

/** The built-in directory owns its draft/publication, never other website settings. */
export class EventDirectoryService {
  private readonly repository: CmsRepository;
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly media: MediaService,
  ) {
    this.repository = new CmsRepository(db);
  }

  async workspace(
    actor: TrustedActor,
    rawLocale: unknown,
  ): Promise<EventDirectoryWorkspace> {
    const locale = cmsLocaleSchema.parse(rawLocale);
    const { organizationId } = await this.authorization.require(
      actor,
      "cms.edit",
    );
    await this.authorization.features.require(organizationId, "events");
    const row = await this.repository.site(organizationId, locale);
    return {
      version: row?.eventsDirectoryVersion ?? 0,
      draft: row?.eventsDirectoryDraft
        ? eventDirectoryDesignSchema.parse(row.eventsDirectoryDraft)
        : structuredClone(defaultEventDirectoryDesign),
      published: row?.eventsDirectoryPublished
        ? eventDirectoryDesignSchema.parse(row.eventsDirectoryPublished)
        : null,
      replacesWebsitePage: Boolean(
        !row?.eventsDirectoryPublished &&
        row?.published &&
        siteSettingsSchema.parse(row.published).eventsPageId,
      ),
    };
  }

  async save(actor: TrustedActor, input: unknown) {
    const parsed = saveInput.parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "cms.edit",
        tx,
      );
      await this.authorization.features.require(organizationId, "events", tx);
      const row = await this.repository.site(organizationId, parsed.locale, tx);
      this.expectVersion(
        row?.eventsDirectoryVersion ?? 0,
        parsed.expectedVersion,
      );
      await this.media.replaceUsage(
        `event-directory:${parsed.locale}:draft`,
        organizationId,
        parsed.design.coverImageId ? [parsed.design.coverImageId] : [],
        tx,
      );
      if (row)
        await tx
          .update(cmsSite)
          .set({
            eventsDirectoryDraft: parsed.design,
            eventsDirectoryVersion: row.eventsDirectoryVersion + 1,
          })
          .where(eq(cmsSite.id, row.id));
      else
        await tx
          .insert(cmsSite)
          .values({
            organizationId,
            locale: parsed.locale,
            draft: defaultSiteSettings,
            eventsDirectoryDraft: parsed.design,
            eventsDirectoryVersion: 1,
          });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "events.directory.saved",
      });
    });
    return this.workspace(actor, parsed.locale);
  }

  async publish(actor: TrustedActor, input: unknown) {
    const parsed = versionInput.parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "cms.publish",
        tx,
      );
      await this.authorization.features.require(organizationId, "events", tx);
      const row = await this.repository.site(organizationId, parsed.locale, tx);
      this.expectVersion(
        row?.eventsDirectoryVersion ?? 0,
        parsed.expectedVersion,
      );
      if (!row?.eventsDirectoryDraft)
        throw new DomainError(
          "DRAFT_REQUIRED",
          "Save your directory design before publishing.",
          422,
        );
      const design = eventDirectoryDesignSchema.parse(row.eventsDirectoryDraft);
      await this.media.replaceUsage(
        `event-directory:${parsed.locale}:published`,
        organizationId,
        design.coverImageId ? [design.coverImageId] : [],
        tx,
        true,
      );
      await tx
        .update(cmsSite)
        .set({
          eventsDirectoryPublished: design,
          eventsDirectoryVersion: row.eventsDirectoryVersion + 1,
        })
        .where(eq(cmsSite.id, row.id));
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "events.directory.published",
      });
    });
    return this.workspace(actor, parsed.locale);
  }

  async publicDesign(rawLocale: unknown) {
    const locale = cmsLocaleSchema.parse(rawLocale);
    if (!(await this.authorization.features.installed()).events) return null;
    const organizationId = await this.repository.organizationId();
    if (!organizationId) return null;
    const row = await this.repository.site(organizationId, locale);
    if (!row?.eventsDirectoryPublished) return null;
    const design = eventDirectoryDesignSchema.parse(
      row.eventsDirectoryPublished,
    );
    await this.media.assertPublicAssets(
      organizationId,
      design.coverImageId ? [design.coverImageId] : [],
      this.db,
    );
    return design;
  }

  private expectVersion(actual: number, expected: number) {
    if (actual !== expected)
      throw new DomainError(
        "REVISION_CONFLICT",
        "This directory was changed elsewhere. Your entered design is kept; reload the saved design before trying again.",
        409,
      );
  }
}
