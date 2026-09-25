import "server-only";
import { db } from "@/infrastructure/database/client";
import { AutomationAccess } from "@/integrations/automation/AutomationAccess";
import { ContentImportService } from "@/integrations/automation/ContentImportService";
import { ReferenceWebsiteClient } from "@/integrations/automation/ReferenceWebsiteClient";
import { services } from "./services";

export const automationAccess = new AutomationAccess(
  db,
  services.authorization,
  services.limiter,
);
export const contentImports = new ContentImportService(
  db,
  services.authorization,
  services.cms,
);
const sources = new ReferenceWebsiteClient();
export async function automationContext(request: Request) {
  return {
    services,
    principal: await automationAccess.authenticate(request),
    imports: contentImports,
    sources,
  };
}
