import "server-only";
import { and, eq } from "drizzle-orm";
import { automationAvailability } from "../../../db/schema/automation-availability";
import { installation } from "../../../db/schema/club";
import type { Database } from "@/infrastructure/database/client";
import {
  DomainError,
  type AuthorizationService,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import { AuditRepository } from "@/core/audit/AuditRepository";
import {
  automationTransport,
  availabilityChange,
  transportDescriptions,
  type AutomationTransport,
  type AutomationAvailabilityState,
} from "./availability_schemas";

export class AutomationAvailability {
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
  ) {}

  async states(organizationId: string): Promise<AutomationAvailabilityState[]> {
    const rows = await this.db
      .select()
      .from(automationAvailability)
      .where(eq(automationAvailability.organizationId, organizationId));
    return automationTransport.options.map((kind) => {
      const row = rows.find((row) => row.kind === kind);
      return {
        kind,
        enabled: row?.enabled ?? false,
        version: row?.version ?? 0,
      };
    });
  }
  async list(actor: TrustedActor) {
    const { organizationId } = await this.authorization.require(
      actor,
      "integrations.manage",
    );
    return this.states(organizationId);
  }
  async requireEnabled(kind: AutomationTransport, organizationId?: string) {
    if (!organizationId) {
      const [installed] = await this.db
        .select({ organizationId: installation.organizationId })
        .from(installation)
        .where(eq(installation.id, 1));
      organizationId = installed?.organizationId ?? undefined;
    }
    if (
      !organizationId ||
      !(await this.states(organizationId)).find((state) => state.kind === kind)
        ?.enabled
    )
      throw new DomainError(
        "AUTOMATION_DISABLED",
        `${transportDescriptions[kind].name} is disabled. Enable it in Integrations before connecting.`,
        409,
      );
  }
  async change(actor: TrustedActor, input: unknown) {
    const values = availabilityChange.parse(input);
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "integrations.manage",
        tx,
      );
      this.authorization.requireRecent(actor);
      const [current] = await tx
        .select()
        .from(automationAvailability)
        .where(
          and(
            eq(automationAvailability.organizationId, organizationId),
            eq(automationAvailability.kind, values.kind),
          ),
        );
      if ((current?.version ?? 0) !== values.expectedVersion)
        throw new DomainError(
          "AUTOMATION_AVAILABILITY_CHANGED",
          "Availability changed. Reload Integrations and review again.",
          409,
        );
      const update = {
        enabled: values.enabled,
        version: (current?.version ?? 0) + 1,
      };
      await tx
        .insert(automationAvailability)
        .values({ organizationId, kind: values.kind, ...update })
        .onConflictDoUpdate({
          target: [
            automationAvailability.organizationId,
            automationAvailability.kind,
          ],
          set: update,
        });
      await new AuditRepository().record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: `automation.${values.kind}.${values.enabled ? "enabled" : "disabled"}`,
        targetId: organizationId,
      });
      return { kind: values.kind, ...update };
    });
  }
}
