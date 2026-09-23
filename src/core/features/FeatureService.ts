import "server-only";
import { clubFeature } from "../../../db/schema/features";
import type { Database } from "../../infrastructure/database/client";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
} from "../authorization/AuthorizationService";
import { AuditRepository } from "../audit/AuditRepository";
import { featureChangeSchema } from "./feature_catalogue";

export class FeatureService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
  ) {}

  async workspace(actor: TrustedActor) {
    const { organizationId } = await this.authorization.require(
      actor,
      "integrations.manage",
    );
    const states = await this.authorization.features.states(organizationId);
    return {
      features: states.map(({ key, enabled, version }) => ({
        key,
        enabled,
        version,
      })),
    };
  }

  async configure(actor: TrustedActor, input: unknown) {
    const values = featureChangeSchema.parse(input);
    this.authorization.requireRecent(actor);
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "integrations.manage",
        tx,
      );
      const states = await this.authorization.features.states(
        organizationId,
        tx,
      );
      const current = states.find((s) => s.key === values.key)!;
      if (values.expectedVersion !== current.version) {
        throw new DomainError(
          "FEATURE_CHANGED",
          "Feature availability changed. Reload the cards before confirming.",
          409,
        );
      }
      if (values.enabled !== current.enabled) {
        const updated = {
          enabled: values.enabled,
          version: current.version + 1,
          lastDisabledAt: values.enabled ? current.lastDisabledAt : new Date(),
        };
        await tx
          .insert(clubFeature)
          .values({ organizationId, key: values.key, ...updated })
          .onConflictDoUpdate({
            target: [clubFeature.organizationId, clubFeature.key],
            set: updated,
          });
        await this.audit.record(tx, {
          organizationId,
          actorUserId: actor.userId,
          action: `feature.${values.key}.${values.enabled ? "enabled" : "disabled"}`,
          targetId: organizationId,
        });
      }
      const saved = await this.authorization.features.states(
        organizationId,
        tx,
      );
      return {
        features: saved.map(({ key, enabled, version }) => ({
          key,
          enabled,
          version,
        })),
      };
    });
  }
}
