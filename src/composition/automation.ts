import "server-only";
import { db } from "@/infrastructure/database/client";
import { AutomationAccess } from "@/integrations/automation/AutomationAccess";
import { ContentImportService } from "@/integrations/automation/ContentImportService";
import { ReferenceWebsiteClient } from "@/integrations/automation/ReferenceWebsiteClient";
import { services } from "./services";
import { OAuthConnections } from "@/integrations/automation/oauth/OAuthConnections";
import { OAuthAccess } from "@/integrations/automation/oauth/OAuthAccess";
import { AutomationAvailability } from "@/integrations/automation/AutomationAvailability";
import type { AutomationTransport } from "@/integrations/automation/availability_schemas";
import { AuditRepository } from "@/core/audit/AuditRepository";

export const automationAvailability = new AutomationAvailability(
  db,
  services.authorization,
);

export const oauthConnections = new OAuthConnections(
  db,
  services.authorization,
  services.limiter,
  automationAvailability,
);
export const oauthAccess = new OAuthAccess(
  oauthConnections,
  services.authorization,
  services.limiter,
);

export const automationAccess = new AutomationAccess(
  db,
  services.authorization,
  services.limiter,
  oauthAccess,
);
export const contentImports = new ContentImportService(
  db,
  services.authorization,
  services.cms,
);
const sources = new ReferenceWebsiteClient();
export async function automationContext(
  request: Request,
  transport: AutomationTransport,
) {
  await automationAvailability.requireEnabled(transport);
  const authenticate = async (consumeQuota: boolean) => {
    const principal = await automationAccess.authenticate(request, {
      transport,
      consumeQuota,
    });
    await automationAvailability.requireEnabled(
      transport,
      principal.organizationId,
    );
    return principal;
  };
  const principal = await authenticate(true);
  return {
    services,
    principal,
    recordActivity: principal.keyId.startsWith("oauth:")
      ? (operation: string, outcome: "succeeded" | "failed") =>
          new AuditRepository().record(db, {
            organizationId: principal.organizationId,
            actorUserId: principal.actor.userId,
            targetId: principal.keyId,
            action: `automation.tool.${outcome}.${operation}`,
          })
      : undefined,
    reauthorize: () => authenticate(false),
    imports: contentImports,
    sources,
  };
}
