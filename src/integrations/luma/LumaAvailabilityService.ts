import "server-only";
import { and, count, eq, isNotNull } from "drizzle-orm";
import {
  lumaAvailability,
  lumaEventLink,
} from "../../../db/schema/integrations";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import {
  lumaAvailabilitySchema,
  type LumaAvailabilityDto,
} from "./luma_schemas";

export class LumaAvailabilityService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
  ) {}
  async enabled(organizationId: string, executor: DatabaseExecutor = this.db) {
    const [row] = await executor
      .select({ enabled: lumaAvailability.enabled })
      .from(lumaAvailability)
      .where(eq(lumaAvailability.organizationId, organizationId));
    return row?.enabled ?? false;
  }
  private async settings(
    organizationId: string,
    executor: DatabaseExecutor,
  ): Promise<LumaAvailabilityDto> {
    const [row] = await executor
      .select({
        enabled: lumaAvailability.enabled,
        version: lumaAvailability.version,
      })
      .from(lumaAvailability)
      .where(eq(lumaAvailability.organizationId, organizationId));
    const [links] = await executor
      .select({ value: count() })
      .from(lumaEventLink)
      .where(
        and(
          eq(lumaEventLink.organizationId, organizationId),
          isNotNull(lumaEventLink.publishedAt),
        ),
      );
    return {
      enabled: row?.enabled ?? false,
      version: row?.version ?? 0,
      publishedLinkCount: links.value,
    };
  }
  async workspace(actor: TrustedActor) {
    const { organizationId } = await this.authorization.require(
      actor,
      "integrations.manage",
    );
    return this.settings(organizationId, this.db);
  }
  async configure(actor: TrustedActor, input: unknown) {
    const values = lumaAvailabilitySchema.parse(input);
    this.authorization.requireRecent(actor);
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "integrations.manage",
        tx,
      );
      const current = await this.settings(organizationId, tx);
      if (current.version !== values.expectedVersion)
        throw new DomainError(
          "LUMA_AVAILABILITY_CHANGED",
          "Reload the current Luma availability before confirming.",
          409,
        );
      await tx
        .insert(lumaAvailability)
        .values({
          organizationId,
          enabled: values.enabled,
          version: current.version + 1,
        })
        .onConflictDoUpdate({
          target: lumaAvailability.organizationId,
          set: { enabled: values.enabled, version: current.version + 1 },
        });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: values.enabled
          ? "integration.luma.enabled"
          : "integration.luma.disabled",
        targetId: organizationId,
      });
      return this.settings(organizationId, tx);
    });
  }
}
