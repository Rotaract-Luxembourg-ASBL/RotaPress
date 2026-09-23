import "server-only";
import { and, eq } from "drizzle-orm";
import { emailTemplate, emailTemplateOverride } from "../../../db/schema/email";
import type { Database } from "@/infrastructure/database/client";
import type { DatabaseExecutor } from "@/core/authorization/AuthorizationService";
import { emailTemplateCatalogue } from "./email_templates";
import type { EmailTemplateKey, EmailTemplateTarget } from "./email_schemas";

/** Sending always reads published overrides, then the shared published/default template. */
export class EmailTemplateReader {
  constructor(private readonly db: Database) {}
  async shared(
    organizationId: string,
    key: EmailTemplateKey,
    executor: DatabaseExecutor = this.db,
  ) {
    const [row] = await executor
      .select({ published: emailTemplate.published })
      .from(emailTemplate)
      .where(
        and(
          eq(emailTemplate.organizationId, organizationId),
          eq(emailTemplate.key, key),
        ),
      );
    return row?.published ?? emailTemplateCatalogue[key].defaults;
  }
  async resolve(
    organizationId: string,
    key: EmailTemplateKey,
    target?: EmailTemplateTarget,
  ) {
    if (target) {
      const [row] = await this.db
        .select({ published: emailTemplateOverride.published })
        .from(emailTemplateOverride)
        .where(
          and(
            eq(emailTemplateOverride.organizationId, organizationId),
            eq(emailTemplateOverride.key, key),
            target.kind === "calendar"
              ? eq(emailTemplateOverride.calendarId, target.id)
              : eq(emailTemplateOverride.formId, target.id),
          ),
        );
      if (row?.published) return row.published;
    }
    return this.shared(organizationId, key);
  }
}
