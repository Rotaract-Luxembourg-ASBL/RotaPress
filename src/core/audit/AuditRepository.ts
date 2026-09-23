import "server-only";
import { auditEntry } from "../../../db/schema/club";
import type { DatabaseExecutor } from "../authorization/AuthorizationService";

/** Audit only stable identifiers and actions, never credentials or application contents. */
export class AuditRepository {
  async record(executor: DatabaseExecutor, entry: {
    organizationId: string;
    actorUserId: string;
    action: string;
    targetId?: string;
  }): Promise<void> {
    await executor.insert(auditEntry).values(entry);
  }
}
