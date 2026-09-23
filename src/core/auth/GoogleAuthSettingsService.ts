import "server-only";
import { eq } from "drizzle-orm";
import { organization } from "../../../db/schema/club";
import { googleAuthConfiguration } from "../../../db/schema/google-auth";
import type { Database } from "../../infrastructure/database/client";
import { AuditRepository } from "../audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "../authorization/AuthorizationService";
import { GoogleAuthStore } from "./GoogleAuthStore";
import {
  googleAuthActionSchema,
  googleAuthEnabledSchema,
  googleAuthSaveSchema,
  type GoogleAuthSettings,
} from "./google_auth_schemas";

export class GoogleAuthSettingsService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly store: GoogleAuthStore,
    private readonly appUrl: string,
  ) {}

  private async projection(
    actor: TrustedActor,
    executor: DatabaseExecutor,
  ): Promise<GoogleAuthSettings> {
    const scope = await this.authorization.require(
      actor,
      "integrations.manage",
      executor,
    );
    const current = await this.store.current(executor);
    const [club] = await executor
      .select({ policy: organization.staffAuthPolicy })
      .from(organization)
      .where(eq(organization.id, scope.organizationId));
    return {
      version: current.version,
      configured: Boolean(current.clientId && current.clientSecret),
      enabled: current.enabled,
      clientId: current.clientId ?? "",
      hasSecret: Boolean(current.clientSecret),
      encryptionReady: this.store.cipher.ready,
      verifiedAt: current.verifiedAt?.toISOString() ?? null,
      staffRequiresGoogle: club.policy === "google",
      canManage: scope.capabilities.includes("ownership.manage"),
      origin: new URL(this.appUrl).origin,
      callbackUrl: new URL("/api/auth/callback/google", this.appUrl).href,
    };
  }

  workspace(actor: TrustedActor) {
    return this.projection(actor, this.db);
  }

  private async change(
    actor: TrustedActor,
    expectedVersion: number,
    action: string,
    update: (current: Awaited<ReturnType<GoogleAuthStore["current"]>>) => {
      clientId: string | null;
      clientSecret: string | null;
      enabled: boolean;
    },
  ) {
    this.authorization.requireRecent(actor);
    return this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(
        actor,
        "ownership.manage",
        tx,
      );
      if (
        actor.authMethod === "google" &&
        !(await this.store.accepts(actor.authProviderVersion, tx))
      ) {
        throw new DomainError(
          "GOOGLE_SESSION_REQUIRED",
          "Google settings changed. Sign in again before changing credentials.",
          401,
        );
      }
      const current = await this.store.current(tx);
      if (current.version !== expectedVersion)
        throw new DomainError(
          "GOOGLE_CONFIGURATION_CHANGED",
          "Google settings changed. Reload before confirming.",
          409,
        );
      const [club] = await tx
        .select({ policy: organization.staffAuthPolicy })
        .from(organization)
        .where(eq(organization.id, scope.organizationId));
      if (club.policy === "google")
        throw new DomainError(
          "GOOGLE_REQUIRED_FOR_STAFF",
          "Change staff access to email or Google in Settings before changing this integration.",
          409,
        );
      const next = update(current);
      const values = {
        ...next,
        version: current.version + 1,
        verifiedAt: null,
        updatedAt: new Date(),
      };
      await tx
        .insert(googleAuthConfiguration)
        .values({ organizationId: scope.organizationId, ...values })
        .onConflictDoUpdate({
          target: googleAuthConfiguration.organizationId,
          set: values,
        });
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action,
        targetId: scope.organizationId,
      });
      return this.projection(actor, tx);
    });
  }

  async save(actor: TrustedActor, input: unknown) {
    const values = googleAuthSaveSchema.parse(input);
    return this.change(
      actor,
      values.expectedVersion,
      "integration.google.credentials_saved",
      (current) => {
        const secret =
          values.clientSecret ??
          (values.clientId === current.clientId
            ? this.store.credential(current)
            : null);
        if (!secret)
          throw new DomainError(
            "GOOGLE_SECRET_REQUIRED",
            "Enter a client secret for this Google client ID.",
            422,
          );
        return {
          clientId: values.clientId,
          clientSecret: this.store.cipher.seal(
            secret,
            `google-auth:${current.organizationId}`,
          ),
          enabled: false,
        };
      },
    );
  }

  async setEnabled(actor: TrustedActor, input: unknown) {
    const values = googleAuthEnabledSchema.parse(input);
    return this.change(
      actor,
      values.expectedVersion,
      values.enabled
        ? "integration.google.enabled"
        : "integration.google.disabled",
      (current) => {
        if (values.enabled && (!current.clientId || !current.clientSecret))
          throw new DomainError(
            "GOOGLE_UNCONFIGURED",
            "Save Google credentials before enabling sign-in.",
            409,
          );
        const secret = this.store.credential(current);
        return {
          clientId: current.clientId,
          clientSecret: secret
            ? this.store.cipher.seal(
                secret,
                `google-auth:${current.organizationId}`,
              )
            : null,
          enabled: values.enabled,
        };
      },
    );
  }

  async disconnect(actor: TrustedActor, input: unknown) {
    const values = googleAuthActionSchema.parse(input);
    return this.change(
      actor,
      values.expectedVersion,
      "integration.google.disconnected",
      () => ({ clientId: null, clientSecret: null, enabled: false }),
    );
  }
}
