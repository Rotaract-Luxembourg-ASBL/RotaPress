import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { partner } from "../../../db/schema/partners";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { MediaService } from "../media";
import { EventService } from "../events/EventService";
import { PartnerReader } from "./PartnerReader";
import {
  partnerProfileSchema,
  partnerPublicationSchema,
  partnerSaveSchema,
  partnerVersionSchema,
  type PartnerDto,
  type PartnerPlacement,
} from "./partner_schemas";

type PartnerRow = typeof partner.$inferSelect;
type Usage = {
  placements(
    organizationId: string,
    id: string,
    executor: DatabaseExecutor,
  ): Promise<PartnerPlacement[]>;
};

export class PartnerService {
  private readonly audit = new AuditRepository();
  private readonly reader = new PartnerReader();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly media: MediaService,
    private readonly usage: Usage,
    private readonly events = new EventService(db, authorization),
  ) {}

  async list(actor: TrustedActor) {
    const { organizationId } = await this.authorization.require(
      actor,
      "cms.edit",
    );
    const rows = await this.db
      .select()
      .from(partner)
      .where(eq(partner.organizationId, organizationId))
      .orderBy(partner.updatedAt);
    return Promise.all(rows.map((row) => this.dto(row, this.db, actor)));
  }

  async create(actor: TrustedActor, input: unknown) {
    const profile = partnerProfileSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "cms.edit",
        tx,
      );
      await this.media.assertOwnedAssets(
        organizationId,
        profile.logoId ? [profile.logoId] : [],
        tx,
      );
      const [row] = await tx
        .insert(partner)
        .values({ organizationId, draft: profile })
        .returning();
      await this.retain(row, tx);
      await this.record(actor, row, "created", tx);
      return this.dto(row, tx, actor);
    });
  }

  async change(
    actor: TrustedActor,
    id: string,
    operation: "save" | "publish" | "unpublish" | "restore",
    input: unknown,
  ): Promise<PartnerDto> {
    z.uuid().parse(id);
    const values =
      operation === "save"
        ? partnerSaveSchema.parse(input)
        : operation === "restore"
          ? partnerVersionSchema.parse(input)
          : partnerPublicationSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        operation === "publish" || operation === "unpublish"
          ? "cms.publish"
          : "cms.edit",
        tx,
      );
      const [row] = await tx
        .select()
        .from(partner)
        .where(
          and(eq(partner.id, id), eq(partner.organizationId, organizationId)),
        );
      if (!row)
        throw new DomainError(
          "PARTNER_NOT_FOUND",
          "This partner is unavailable.",
          404,
        );
      if (row.version !== values.expectedVersion)
        throw new DomainError(
          "PARTNER_CONFLICT",
          "This profile changed. Reopen it to review the latest version before saving.",
          409,
        );
      // Repeating an unchanged publication must not replace the rollback snapshot.
      if (
        operation === "publish" &&
        row.published &&
        JSON.stringify(partnerProfileSchema.parse(row.draft)) ===
          JSON.stringify(partnerProfileSchema.parse(row.published))
      )
        return this.dto(row, tx, actor);
      const changes: Partial<PartnerRow> = {
        version: row.version + 1,
        updatedAt: new Date(),
      };
      if (operation === "save" && "profile" in values)
        changes.draft = values.profile;
      if (operation === "restore") {
        if (!row.previous)
          throw new DomainError(
            "PARTNER_NO_PREVIOUS",
            "There is no previous publication to restore.",
            409,
          );
        changes.draft = partnerProfileSchema.parse(row.previous);
      }
      if (operation === "publish") {
        changes.published = partnerProfileSchema.parse(row.draft);
        changes.previous = row.published ?? row.previous;
      }
      if (operation === "unpublish") {
        if (
          (await this.usage.placements(organizationId, id, tx)).some(
            (placement) => !placement.dynamic,
          )
        )
          throw new DomainError(
            "PARTNER_IN_USE",
            "Remove this partner from its published pages, reusable sections, event pages and prizes before unpublishing it.",
            409,
          );
        changes.previous = row.published ?? row.previous;
        changes.published = null;
      }
      const [updated] = await tx
        .update(partner)
        .set(changes)
        .where(eq(partner.id, id))
        .returning();
      await this.retain(updated, tx);
      await this.record(actor, updated, operation, tx);
      return this.dto(updated, tx, actor);
    });
  }

  /** Only published profiles are selectable by scoped event editors. */
  publishedSelection(organizationId: string) {
    return this.reader.published(organizationId, this.db);
  }

  private async dto(
    row: PartnerRow,
    executor: DatabaseExecutor,
    actor: TrustedActor,
  ): Promise<PartnerDto> {
    const draft = partnerProfileSchema.parse(row.draft);
    const published = row.published
      ? partnerProfileSchema.parse(row.published)
      : null;
    const placements = await this.usage.placements(
      row.organizationId,
      row.id,
      executor,
    );
    const visible = await Promise.all(
      placements.map(async (placement) => {
        if (!placement.eventId) return placement;
        try {
          await this.events.detail(actor, placement.eventId, executor);
          return placement;
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
          // Retain the existence of shared usage without disclosing private event metadata.
          return {
            id: null,
            title: "Restricted event page",
            locale: null,
            eventId: null,
            ...(placement.dynamic ? { dynamic: true } : {}),
          };
        }
      }),
    );
    return {
      id: row.id,
      version: row.version,
      draft,
      published,
      previous: row.previous ? partnerProfileSchema.parse(row.previous) : null,
      changed: JSON.stringify(draft) !== JSON.stringify(published),
      placements: visible,
    };
  }

  private async retain(
    row: PartnerRow,
    tx: Parameters<MediaService["replaceUsage"]>[3],
  ) {
    for (const slot of ["draft", "published", "previous"] as const) {
      const profile = row[slot] ? partnerProfileSchema.parse(row[slot]) : null;
      await this.media.replaceUsage(
        `partner:${row.id}:${slot}`,
        row.organizationId,
        profile?.logoId ? [profile.logoId] : [],
        tx,
        slot === "published",
      );
    }
  }

  private record(
    actor: TrustedActor,
    row: PartnerRow,
    action: string,
    executor: DatabaseExecutor,
  ) {
    return this.audit.record(executor, {
      organizationId: row.organizationId,
      actorUserId: actor.userId,
      action: `partner.${action}`,
      targetId: row.id,
    });
  }
}
