import "server-only";
import type { Database } from "../../infrastructure/database/client";
import { AuditRepository } from "../audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
  type DatabaseExecutor,
} from "../authorization/AuthorizationService";
import { OrganizationRepository } from "./OrganizationRepository";
import {
  organizationSettingsSchema,
  type OrganizationSettings,
} from "./organization_schemas";

export class OrganizationService {
  private readonly repository: OrganizationRepository;
  private readonly audit = new AuditRepository();

  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly google: {
      enabled(executor?: DatabaseExecutor): Promise<boolean>;
      accepts(version: unknown, executor?: DatabaseExecutor): Promise<boolean>;
    },
  ) {
    this.repository = new OrganizationRepository(db);
  }

  publicIdentity() {
    return this.repository.publicIdentity();
  }

  async settings(actor: TrustedActor): Promise<OrganizationSettings> {
    const scope = await this.authorization.require(actor, "settings.manage");
    return organizationSettingsSchema.parse(
      await this.repository.settings(scope.organizationId),
    );
  }

  async update(
    actor: TrustedActor,
    input: unknown,
  ): Promise<OrganizationSettings> {
    const settings = organizationSettingsSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(actor, "settings.manage", tx);
      const current = await this.repository.settings(scope.organizationId, tx);
      if (!current)
        throw new DomainError(
          "ORGANIZATION_MISSING",
          "Club settings are unavailable.",
          409,
        );
      if (settings.staffAuthPolicy !== current.staffAuthPolicy) {
        this.authorization.requireRecent(actor);
        await this.authorization.require(actor, "ownership.manage", tx);
      }
      if (settings.staffAuthPolicy === "google") {
        if (!(await this.google.enabled(tx))) {
          throw new DomainError(
            "GOOGLE_UNCONFIGURED",
            "Configure and verify Google sign-in before requiring it.",
            409,
          );
        }
        if (
          actor.authMethod !== "google" ||
          !(await this.google.accepts(actor.authProviderVersion, tx))
        ) {
          throw new DomainError(
            "GOOGLE_SESSION_REQUIRED",
            "Sign in with Google before enabling this policy.",
          );
        }
      }
      await this.repository.update(scope.organizationId, settings, tx);
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "organization.settings_updated",
        targetId: scope.organizationId,
      });
      return settings;
    });
  }
}
