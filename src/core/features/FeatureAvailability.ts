import "server-only";
import { eq } from "drizzle-orm";
import { clubFeature } from "../../../db/schema/features";
import { installation } from "../../../db/schema/club";
import type { Database } from "../../infrastructure/database/client";
import type { DatabaseExecutor } from "../authorization/AuthorizationService";
import { DomainError } from "../DomainError";
import {
  featureCatalogue,
  featureKeySchema,
  type FeatureFlags,
  type FeatureKey,
} from "./feature_catalogue";

/** Availability never grants permission; callers must still authorize their resource. */
export class FeatureAvailability {
  constructor(private readonly db: Database) {}

  async states(organizationId: string, executor: DatabaseExecutor = this.db) {
    const rows = await executor
      .select()
      .from(clubFeature)
      .where(eq(clubFeature.organizationId, organizationId));
    // Preserve the existing installation's behavior until an explicit reviewed change.
    return featureKeySchema.options.map(
      (key) =>
        rows.find((row) => row.key === key) ?? {
          key,
          enabled: true,
          version: 0,
          lastDisabledAt: null,
        },
    );
  }

  async flags(
    organizationId: string,
    executor: DatabaseExecutor = this.db,
  ): Promise<FeatureFlags> {
    const states = await this.states(organizationId, executor);
    return {
      forms: states.some((s) => s.key === "forms" && s.enabled),
      events: states.some((s) => s.key === "events" && s.enabled),
      calendar: states.some((s) => s.key === "calendar" && s.enabled),
    };
  }

  async installed(): Promise<FeatureFlags> {
    const [row] = await this.db
      .select({ id: installation.organizationId })
      .from(installation)
      .where(eq(installation.id, 1));
    return row?.id
      ? this.flags(row.id)
      : { forms: false, events: false, calendar: false };
  }

  async enabled(
    organizationId: string,
    key: FeatureKey,
    executor: DatabaseExecutor = this.db,
  ) {
    return (await this.flags(organizationId, executor))[key];
  }

  async require(
    organizationId: string,
    key: FeatureKey,
    executor: DatabaseExecutor = this.db,
  ) {
    if (!(await this.enabled(organizationId, key, executor))) {
      throw new DomainError(
        "FEATURE_DISABLED",
        `${featureCatalogue[key].name} is disabled for this club. An administrator can enable it in Integrations.`,
        409,
      );
    }
  }

  /** Re-enabling must not revive work queued before the last explicit disable. */
  async requireQueuedWork(
    organizationId: string,
    key: FeatureKey,
    createdAt: Date,
    executor: DatabaseExecutor,
  ) {
    const state = (await this.states(organizationId, executor)).find(
      (s) => s.key === key,
    )!;
    if (
      !state.enabled ||
      (state.lastDisabledAt && state.lastDisabledAt >= createdAt)
    ) {
      throw new DomainError(
        "FEATURE_WORK_CANCELLED",
        "This feature was disabled after the work was scheduled. Review and schedule it again.",
        409,
      );
    }
  }
}
