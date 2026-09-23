import "server-only";
import { and, eq } from "drizzle-orm";
import { installation } from "../../../db/schema/club";
import { googleAuthConfiguration } from "../../../db/schema/google-auth";
import type { Database } from "../../infrastructure/database/client";
import type { CredentialCipher } from "../../infrastructure/security/CredentialCipher";
import {
  DomainError,
  type DatabaseExecutor,
} from "../authorization/AuthorizationService";
export type GoogleProviderConfiguration = {
  clientId: string;
  clientSecret: string;
  version: string;
};
type Configuration = {
  organizationId: string | null;
  version: number;
  clientId: string | null;
  clientSecret: string | null;
  enabled: boolean;
  verifiedAt: Date | null;
};

/** Server-only credential storage. No cached availability survives a configuration change. */
export class GoogleAuthStore {
  constructor(
    private readonly db: Database,
    readonly cipher: CredentialCipher,
  ) {}

  async current(executor: DatabaseExecutor = this.db): Promise<Configuration> {
    const [installed] = await executor
      .select({ organizationId: installation.organizationId })
      .from(installation)
      .where(eq(installation.id, 1));
    const organizationId = installed?.organizationId ?? null;
    if (organizationId) {
      const [row] = await executor
        .select()
        .from(googleAuthConfiguration)
        .where(eq(googleAuthConfiguration.organizationId, organizationId));
      if (row) return row;
    }
    return {
      organizationId,
      version: 0,
      clientId: null,
      clientSecret: null,
      enabled: false,
      verifiedAt: null,
    };
  }

  credential(current: Configuration): string | null {
    if (!current.clientSecret) return null;
    return this.cipher.open(
      current.clientSecret,
      `google-auth:${current.organizationId}`,
    );
  }

  private token(current: Configuration) {
    return `${current.organizationId}:${current.version}`;
  }

  async runtime(
    executor: DatabaseExecutor = this.db,
  ): Promise<GoogleProviderConfiguration | null> {
    const current = await this.current(executor);
    if (!current.enabled || !current.clientId || !current.clientSecret)
      return null;
    return {
      clientId: current.clientId,
      clientSecret: this.credential(current)!,
      version: this.token(current),
    };
  }

  async enabled(executor: DatabaseExecutor = this.db): Promise<boolean> {
    try {
      return Boolean(await this.runtime(executor));
    } catch (error) {
      if (
        error instanceof DomainError &&
        ["ENCRYPTION_UNAVAILABLE", "CREDENTIAL_UNREADABLE"].includes(error.code)
      )
        return false;
      throw error;
    }
  }

  async accepts(
    version: unknown,
    executor: DatabaseExecutor = this.db,
  ): Promise<boolean> {
    if (typeof version !== "string" || !version) return false;
    try {
      return (await this.runtime(executor))?.version === version;
    } catch (error) {
      if (error instanceof DomainError) return false;
      throw error;
    }
  }

  /** Called only after Better Auth has created a session from its verified Google callback. */
  async markVerified(version: string): Promise<void> {
    const current = await this.current();
    if (
      !current.enabled ||
      this.token(current) !== version ||
      !current.organizationId
    )
      return;
    await this.db
      .update(googleAuthConfiguration)
      .set({ verifiedAt: new Date() })
      .where(
        and(
          eq(googleAuthConfiguration.organizationId, current.organizationId),
          eq(googleAuthConfiguration.version, current.version),
          eq(googleAuthConfiguration.enabled, true),
        ),
      );
  }
}
