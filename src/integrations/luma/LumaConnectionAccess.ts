import "server-only";
import { eq } from "drizzle-orm";
import { lumaConnection } from "../../../db/schema/integrations";
import {
  DomainError,
  type DatabaseExecutor,
} from "../../core/authorization/AuthorizationService";
import { CredentialCipher } from "./CredentialCipher";
import { LumaAvailabilityService } from "./LumaAvailabilityService";
import type { ConnectionMode } from "./connection_schemas";

/** Internal adapter access after the owning event operation has authorized its scope. */
export class LumaConnectionAccess {
  constructor(
    private readonly availability: LumaAvailabilityService,
    private readonly cipher: CredentialCipher,
    readonly mode: ConnectionMode,
  ) {}
  private async row(organizationId: string, executor: DatabaseExecutor) {
    const [row] = await executor
      .select()
      .from(lumaConnection)
      .where(eq(lumaConnection.organizationId, organizationId));
    if (
      this.mode === "blocked" ||
      !(await this.availability.enabled(organizationId, executor)) ||
      !row?.credential ||
      row.checkState !== "verified" ||
      !row.calendarId ||
      !this.cipher.ready
    )
      throw new DomainError(
        "SYNC_UNAVAILABLE",
        "An allowed, checked API connection is required. Ask a club administrator to review Integrations.",
        409,
      );
    return { ...row, credential: row.credential, calendarId: row.calendarId };
  }
  async capture(organizationId: string, executor: DatabaseExecutor) {
    const row = await this.row(organizationId, executor);
    return {
      id: row.id,
      version: row.version,
      calendarId: row.calendarId,
      apiKey: this.cipher.open(row.credential, `${organizationId}:${row.id}`),
    };
  }
  async assertCurrent(
    organizationId: string,
    id: string,
    version: number,
    executor: DatabaseExecutor,
  ) {
    const row = await this.row(organizationId, executor);
    if (row.id !== id || row.version !== version)
      throw new DomainError(
        "CONNECTION_CHANGED",
        "The API connection changed. Start a new reconciliation after it is checked.",
        409,
      );
  }
}
