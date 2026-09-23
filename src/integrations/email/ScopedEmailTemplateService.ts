import "server-only";
import { and, eq } from "drizzle-orm";
import { calendar } from "../../../db/schema/calendar";
import { organization } from "../../../db/schema/club";
import { emailTemplateOverride } from "../../../db/schema/email";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import { AuditRepository } from "@/core/audit/AuditRepository";
import { FormScopePolicy } from "@/features/forms/FormScopePolicy";
import { formDefinitionSchema } from "@/features/forms/form_schemas";
import type { Database } from "@/infrastructure/database/client";
import {
  emailTemplateTargetSchema,
  scopedEmailActionSchema,
  type EmailTemplateTarget,
  type EmailTemplateKey,
  type ScopedEmailWorkspace,
} from "./email_schemas";
import { EmailTemplateReader } from "./EmailTemplateReader";

export class ScopedEmailTemplateService {
  private readonly forms: FormScopePolicy;
  private readonly reader: EmailTemplateReader;
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
  ) {
    this.forms = new FormScopePolicy(db, authorization);
    this.reader = new EmailTemplateReader(db);
  }
  private async scope(
    actor: TrustedActor,
    target: EmailTemplateTarget,
    executor: DatabaseExecutor,
    tx?: Transaction,
  ) {
    if (target.kind === "form") {
      const { organizationId, current } = tx
        ? await this.forms.lock(actor, target.id, "settings", tx)
        : await this.forms.require(actor, target.id, "settings", executor);
      return {
        organizationId,
        name: formDefinitionSchema.parse(current.draft).title,
        archived: current.archived,
      };
    }
    const scope = tx
      ? await this.authorization.lock(actor, "calendar.manage", tx)
      : await this.authorization.require(actor, "calendar.manage", executor);
    const [row] = await executor
      .select()
      .from(calendar)
      .where(
        and(
          eq(calendar.id, target.id),
          eq(calendar.organizationId, scope.organizationId),
        ),
      );
    if (!row)
      throw new DomainError(
        "CALENDAR_NOT_FOUND",
        "This calendar is unavailable.",
        404,
      );
    return {
      organizationId: scope.organizationId,
      name: row.draft.name,
      archived: row.archived,
    };
  }
  private keys(target: EmailTemplateTarget): EmailTemplateKey[] {
    return target.kind === "calendar"
      ? ["calendar_update", "calendar_reminder"]
      : ["form_submission"];
  }
  private where(organizationId: string, target: EmailTemplateTarget) {
    return and(
      eq(emailTemplateOverride.organizationId, organizationId),
      target.kind === "calendar"
        ? eq(emailTemplateOverride.calendarId, target.id)
        : eq(emailTemplateOverride.formId, target.id),
    );
  }
  async workspace(
    actor: TrustedActor,
    raw: unknown,
  ): Promise<ScopedEmailWorkspace> {
    const target = emailTemplateTargetSchema.parse(raw);
    const scope = await this.scope(actor, target, this.db);
    const [club] = await this.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, scope.organizationId));
    const rows = await this.db
      .select()
      .from(emailTemplateOverride)
      .where(this.where(scope.organizationId, target));
    return {
      target,
      name: scope.name,
      clubName: club.name,
      readOnly: scope.archived,
      templates: await Promise.all(
        this.keys(target).map(async (key) => {
          const row = rows.find((r) => r.key === key);
          const fallback = await this.reader.shared(scope.organizationId, key);
          return {
            key,
            version: row?.version ?? 0,
            draft: row?.draft ?? fallback,
            published: row?.published ?? null,
            fallback,
          };
        }),
      ),
    };
  }
  async change(actor: TrustedActor, raw: unknown) {
    const value = scopedEmailActionSchema.parse(raw);
    if (!this.keys(value.target).includes(value.key))
      throw new DomainError(
        "EMAIL_TEMPLATE_SCOPE",
        "Choose an email used by this calendar or form.",
        400,
      );
    await this.db.transaction(async (tx) => {
      const scope = await this.scope(actor, value.target, tx, tx);
      if (scope.archived)
        throw new DomainError(
          "EMAIL_SOURCE_ARCHIVED",
          "Restore this calendar or form before changing its emails.",
          409,
        );
      const where = and(
        this.where(scope.organizationId, value.target),
        eq(emailTemplateOverride.key, value.key),
      );
      const [row] = await tx.select().from(emailTemplateOverride).where(where);
      if (
        (row?.version ?? 0) !== value.expectedVersion ||
        (!row && value.operation !== "save")
      )
        throw new DomainError(
          "EMAIL_SETTINGS_CHANGED",
          "These email settings changed. Reload before saving again.",
          409,
        );
      if (value.operation === "save") {
        if (row)
          await tx
            .update(emailTemplateOverride)
            .set({ draft: value.draft, version: row.version + 1 })
            .where(where);
        else
          await tx.insert(emailTemplateOverride).values({
            organizationId: scope.organizationId,
            calendarId:
              value.target.kind === "calendar" ? value.target.id : null,
            formId: value.target.kind === "form" ? value.target.id : null,
            key: value.key,
            draft: value.draft,
          });
      } else {
        await tx
          .update(emailTemplateOverride)
          .set({
            published: value.operation === "publish" ? row.draft : null,
            version: row.version + 1,
          })
          .where(where);
      }
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: `email.template_${value.operation}.${value.target.kind}`,
        targetId: value.target.id,
      });
    });
    return this.workspace(actor, value.target);
  }
}
