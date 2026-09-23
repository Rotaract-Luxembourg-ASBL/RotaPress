import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { lumaConnection } from "../../../db/schema/integrations";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { CredentialCipher } from "./CredentialCipher";
import { LumaAvailabilityService } from "./LumaAvailabilityService";
import { LumaClient, LumaRequestError } from "./LumaClient";
import {
  connectionActionSchema,
  connectionSaveSchema,
  connectionMessages,
  type ConnectionCode,
  type LumaConnectionDto,
} from "./connection_schemas";

export class LumaConnectionService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly availability: LumaAvailabilityService,
    private readonly cipher: CredentialCipher,
    private readonly client: LumaClient,
  ) {}
  private async row(organizationId: string, executor: DatabaseExecutor) {
    const [row] = await executor
      .select()
      .from(lumaConnection)
      .where(eq(lumaConnection.organizationId, organizationId));
    return row;
  }
  private async projection(
    organizationId: string,
    executor: DatabaseExecutor,
  ): Promise<LumaConnectionDto> {
    const row = await this.row(organizationId, executor);
    const interrupted =
      row?.checkState === "checking" &&
      row.attemptedAt &&
      Date.now() - row.attemptedAt.getTime() > 30_000;
    const code = row?.checkCode;
    const message =
      code && Object.hasOwn(connectionMessages, code)
        ? connectionMessages[code as ConnectionCode]
        : null;
    return {
      id: row?.id ?? null,
      version: row?.version ?? 0,
      hasCredential: Boolean(row?.credential),
      calendarId: row?.calendarId ?? null,
      state: interrupted ? "interrupted" : (row?.checkState ?? "disconnected"),
      message,
      attemptedAt: row?.attemptedAt?.toISOString() ?? null,
      checkedAt: row?.checkedAt?.toISOString() ?? null,
      lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
      encryptionReady: this.cipher.ready,
      allowed: await this.availability.enabled(organizationId, executor),
      mode: this.client.mode,
    };
  }
  private expected(actual: number | undefined, expected: number) {
    if ((actual ?? 0) !== expected)
      throw new DomainError(
        "CONNECTION_CHANGED",
        "The connection changed. Reload its current state before confirming.",
        409,
      );
  }
  async workspace(actor: TrustedActor) {
    const { organizationId } = await this.authorization.require(
      actor,
      "integrations.manage",
    );
    return this.projection(organizationId, this.db);
  }
  async save(actor: TrustedActor, input: unknown) {
    const values = connectionSaveSchema.parse(input);
    this.authorization.requireRecent(actor);
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "integrations.manage",
        tx,
      );
      const row = await this.row(organizationId, tx);
      this.expected(row?.version, values.expectedVersion);
      const id = row?.id ?? randomUUID();
      const credential = this.cipher.seal(
        values.apiKey,
        `${organizationId}:${id}`,
      );
      const update = {
        credential,
        version: (row?.version ?? 0) + 1,
        checkState: "unchecked" as const,
        checkCode: null,
        checkedAt: null,
      };
      await tx
        .insert(lumaConnection)
        .values({ id, organizationId, ...update })
        .onConflictDoUpdate({
          target: lumaConnection.organizationId,
          set: update,
        });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "integration.luma.credential_saved",
        targetId: id,
      });
      return this.projection(organizationId, tx);
    });
  }
  async disconnect(actor: TrustedActor, input: unknown) {
    const values = connectionActionSchema.parse(input);
    this.authorization.requireRecent(actor);
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "integrations.manage",
        tx,
      );
      const row = await this.row(organizationId, tx);
      this.expected(row?.version, values.expectedVersion);
      if (!row?.credential) return this.projection(organizationId, tx);
      await tx
        .update(lumaConnection)
        .set({
          credential: null,
          checkState: "disconnected",
          checkCode: null,
          version: row.version + 1,
        })
        .where(eq(lumaConnection.id, row.id));
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "integration.luma.disconnected",
        targetId: row.id,
      });
      return this.projection(organizationId, tx);
    });
  }
  async check(actor: TrustedActor, input: unknown) {
    const values = connectionActionSchema.parse(input);
    this.authorization.requireRecent(actor);
    const pending = await this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "integrations.manage",
        tx,
      );
      const row = await this.row(organizationId, tx);
      this.expected(row?.version, values.expectedVersion);
      if (!row?.credential)
        throw new DomainError(
          "CONNECTION_MISSING",
          "Save an API key before checking the connection.",
          409,
        );
      if (!(await this.availability.enabled(organizationId, tx)))
        throw new DomainError(
          "LUMA_DISABLED",
          "Allow Luma before requesting an API connection check.",
          409,
        );
      if (this.client.mode === "blocked")
        throw new DomainError(
          "LIVE_CHECK_BLOCKED",
          "Live API checks are not enabled for this installation. Saved links remain usable.",
          409,
        );
      if (row.attemptedAt && Date.now() - row.attemptedAt.getTime() < 60_000)
        throw new DomainError(
          "CHECK_RATE_LIMITED",
          "Wait one minute between connection checks, including after replacing a key.",
          429,
        );
      const version = row.version + 1;
      await tx
        .update(lumaConnection)
        .set({
          version,
          checkState: "checking",
          attemptedAt: new Date(),
          checkedAt: null,
          checkCode: null,
        })
        .where(eq(lumaConnection.id, row.id));
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "integration.luma.check_requested",
        targetId: row.id,
      });
      return { ...row, version, credential: row.credential };
    });
    // Network I/O never holds a database transaction or organization lock.
    let calendarId: string | undefined;
    let code: ConnectionCode | undefined;
    try {
      const key = this.cipher.open(
        pending.credential,
        `${pending.organizationId}:${pending.id}`,
      );
      calendarId = (await this.client.check(key)).calendarId;
      if (pending.calendarId && pending.calendarId !== calendarId)
        code = "CALENDAR_CHANGED";
    } catch (error) {
      code =
        error instanceof LumaRequestError
          ? error.code
          : error instanceof DomainError &&
              error.code === "CREDENTIAL_UNREADABLE"
            ? "CREDENTIAL_UNREADABLE"
            : "REQUEST_FAILED";
    }
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "integrations.manage",
        tx,
      );
      if (organizationId !== pending.organizationId)
        throw new DomainError(
          "CONNECTION_CHANGED",
          "The connection scope changed. Reload its current state.",
          409,
        );
      const current = await this.row(organizationId, tx);
      this.expected(current?.version, pending.version);
      if (!(await this.availability.enabled(organizationId, tx)))
        code = "DISABLED";
      const succeeded = !code && Boolean(calendarId);
      await tx
        .update(lumaConnection)
        .set({
          version: pending.version + 1,
          checkState: succeeded ? "verified" : "failed",
          checkCode: code ?? null,
          checkedAt: new Date(),
          ...(succeeded ? { calendarId, lastSuccessAt: new Date() } : {}),
        })
        .where(eq(lumaConnection.id, pending.id));
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: succeeded
          ? "integration.luma.check_succeeded"
          : "integration.luma.check_failed",
        targetId: pending.id,
      });
      return this.projection(organizationId, tx);
    });
  }
}
