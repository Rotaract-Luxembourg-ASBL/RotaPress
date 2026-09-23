import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { emailConnection, emailTemplate } from "../../../db/schema/email";
import { organization } from "../../../db/schema/club";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import { AuditRepository } from "@/core/audit/AuditRepository";
import type { Database } from "@/infrastructure/database/client";
import { EmailDelivery } from "./EmailDelivery";
import {
  connectionSaveSchema,
  connectionActionSchema,
  templateSaveSchema,
  templatePublishSchema,
  templateKeys,
  type EmailWorkspace,
} from "./email_schemas";
import { emailTemplateCatalogue, renderEmail } from "./email_templates";

export class EmailSettingsService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly delivery: EmailDelivery,
    private readonly origin: string,
  ) {}
  async workspace(actor: TrustedActor): Promise<EmailWorkspace> {
    const scope = await this.authorization.require(
      actor,
      "integrations.manage",
    );
    const connections = await this.db
      .select()
      .from(emailConnection)
      .where(eq(emailConnection.organizationId, scope.organizationId));
    const templates = await this.db
      .select()
      .from(emailTemplate)
      .where(eq(emailTemplate.organizationId, scope.organizationId));
    const [club] = await this.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, scope.organizationId));
    return {
      connections: connections.map((c) => ({
        id: c.id,
        name: c.name,
        provider: c.provider,
        senderName: c.senderName,
        senderEmail: c.senderEmail,
        replyTo: c.replyTo,
        smtp: c.smtp,
        version: c.version,
        hasSecret: Boolean(c.secret),
        isDefault: c.isDefault,
        verifiedAt: c.verifiedAt?.toISOString() ?? null,
      })),
      templates: templateKeys.map((key) => {
        const row = templates.find((t) => t.key === key);
        return {
          key,
          version: row?.version ?? 0,
          draft: row?.draft ?? emailTemplateCatalogue[key].defaults,
          published: row?.published ?? null,
        };
      }),
      canManageConnections: scope.capabilities.includes("ownership.manage"),
      encryptionReady: this.delivery.cipher.ready,
      remoteEnabled: this.delivery.transport.remoteEnabled,
      clubName: club.name,
      localDefault: !connections.some((c) => c.isDefault),
    };
  }
  private conflict() {
    return new DomainError(
      "EMAIL_SETTINGS_CHANGED",
      "These settings changed. Reload before saving again.",
      409,
    );
  }
  async saveConnection(actor: TrustedActor, raw: unknown) {
    const values = connectionSaveSchema.parse(raw);
    this.authorization.requireRecent(actor);
    await this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(
        actor,
        "ownership.manage",
        tx,
      );
      const rows = await tx
        .select()
        .from(emailConnection)
        .where(eq(emailConnection.organizationId, scope.organizationId));
      const current = rows.find((c) => c.id === values.id);
      if (values.id && !current)
        throw new DomainError(
          "EMAIL_CONNECTION_MISSING",
          "This connection is unavailable.",
          404,
        );
      if ((current?.version ?? 0) !== values.expectedVersion)
        throw this.conflict();
      if (current?.isDefault)
        throw new DomainError(
          "EMAIL_CONNECTION_ACTIVE",
          "Choose another sending connection before editing this one.",
          409,
        );
      if (!current && rows.length >= 10)
        throw new DomainError(
          "EMAIL_CONNECTION_LIMIT",
          "You can keep up to 10 saved connections.",
          409,
        );
      const id = current?.id ?? randomUUID();
      const sameAccount =
        current?.provider === values.provider &&
        JSON.stringify(current.smtp) === JSON.stringify(values.smtp);
      if (!values.secret && (!current || !sameAccount))
        throw new DomainError(
          "EMAIL_SECRET_REQUIRED",
          "Enter a credential for this connection.",
          422,
        );
      const secret = values.secret
        ? this.delivery.cipher.seal(
            JSON.stringify({ value: values.secret, purpose: "email" }),
            `email:${scope.organizationId}:${id}`,
          )
        : current!.secret;
      const saved = {
        name: values.name,
        provider: values.provider,
        senderName: values.senderName,
        senderEmail: values.senderEmail,
        replyTo: values.replyTo,
        smtp: values.smtp,
        secret,
        verifiedAt: null,
        version: values.expectedVersion + 1,
      };
      if (current)
        await tx
          .update(emailConnection)
          .set(saved)
          .where(
            and(
              eq(emailConnection.id, id),
              eq(emailConnection.organizationId, scope.organizationId),
            ),
          );
      else
        await tx
          .insert(emailConnection)
          .values({ ...saved, id, organizationId: scope.organizationId });
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "email.connection_saved",
        targetId: id,
      });
    });
    return this.workspace(actor);
  }
  async useConnection(actor: TrustedActor, raw: unknown) {
    const values = connectionActionSchema.parse(raw);
    this.authorization.requireRecent(actor);
    await this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(
        actor,
        "ownership.manage",
        tx,
      );
      const [row] = values.id
        ? await tx
            .select()
            .from(emailConnection)
            .where(
              and(
                eq(emailConnection.id, values.id),
                eq(emailConnection.organizationId, scope.organizationId),
              ),
            )
        : [];
      if (values.id && (!row || row.version !== values.expectedVersion))
        throw this.conflict();
      if (row && (!row.verifiedAt || !this.delivery.transport.remoteEnabled))
        throw new DomainError(
          "EMAIL_TEST_REQUIRED",
          "Enable remote delivery on the server and send a successful test before choosing this connection.",
          409,
        );
      await tx
        .update(emailConnection)
        .set({ isDefault: false, version: sql`${emailConnection.version} + 1` })
        .where(
          and(
            eq(emailConnection.organizationId, scope.organizationId),
            eq(emailConnection.isDefault, true),
          ),
        );
      if (row)
        await tx
          .update(emailConnection)
          .set({ isDefault: true, version: row.version + 1 })
          .where(eq(emailConnection.id, row.id));
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "email.sender_selected",
        targetId: values.id ?? scope.organizationId,
      });
    });
    return this.workspace(actor);
  }
  async deleteConnection(actor: TrustedActor, raw: unknown) {
    const values = connectionActionSchema.parse(raw);
    this.authorization.requireRecent(actor);
    await this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(
        actor,
        "ownership.manage",
        tx,
      );
      if (!values.id)
        throw new DomainError(
          "EMAIL_LOCAL_REQUIRED",
          "Local capture belongs to server configuration.",
          400,
        );
      const [row] = await tx
        .select()
        .from(emailConnection)
        .where(
          and(
            eq(emailConnection.id, values.id),
            eq(emailConnection.organizationId, scope.organizationId),
          ),
        );
      if (!row || row.version !== values.expectedVersion) throw this.conflict();
      if (row.isDefault)
        throw new DomainError(
          "EMAIL_CONNECTION_ACTIVE",
          "Choose another sending connection before deleting this one.",
          409,
        );
      await tx.delete(emailConnection).where(eq(emailConnection.id, row.id));
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "email.connection_deleted",
        targetId: row.id,
      });
    });
    return this.workspace(actor);
  }
  async testConnection(actor: TrustedActor, raw: unknown) {
    const values = connectionActionSchema.parse(raw);
    this.authorization.requireRecent(actor);
    // Lock scope while sending the bounded test, so revoked owners cannot use saved credentials.
    await this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(
        actor,
        "ownership.manage",
        tx,
      );
      const [row] = values.id
        ? await tx
            .select()
            .from(emailConnection)
            .where(
              and(
                eq(emailConnection.id, values.id),
                eq(emailConnection.organizationId, scope.organizationId),
              ),
            )
        : [];
      if (values.id && (!row || row.version !== values.expectedVersion))
        throw this.conflict();
      if (row && !this.delivery.transport.remoteEnabled)
        throw new DomainError(
          "REMOTE_EMAIL_DISABLED",
          "Remote email delivery is disabled on this server. Your connection is saved for later.",
          409,
        );
      const content = renderEmail(
        "form_submission",
        {
          ...emailTemplateCatalogue.form_submission.defaults,
          subject: "RotaPress email connection test",
          heading: "Your email connection works",
          body: "This is a test requested from Email settings.",
          buttonLabel: "Email settings",
        },
        {
          clubName: "RotaPress",
          actionUrl: new URL("/admin/integrations/email", this.origin).href,
        },
      );
      try {
        await this.delivery.test(
          {
            ...content,
            to: actor.email,
            messageId: `<test-${randomUUID()}@rotapress.local>`,
          },
          row ?? null,
        );
      } catch {
        throw new DomainError(
          "EMAIL_TEST_FAILED",
          "The test could not be sent. Check the sender, credentials and server settings, then try again.",
          422,
        );
      }
      if (row)
        await tx
          .update(emailConnection)
          .set({ verifiedAt: new Date(), version: row.version + 1 })
          .where(eq(emailConnection.id, row.id));
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "email.connection_tested",
        targetId: values.id ?? scope.organizationId,
      });
    });
    return this.workspace(actor);
  }
  async saveTemplate(actor: TrustedActor, raw: unknown) {
    const values = templateSaveSchema.parse(raw);
    await this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(
        actor,
        "integrations.manage",
        tx,
      );
      const where = and(
        eq(emailTemplate.organizationId, scope.organizationId),
        eq(emailTemplate.key, values.key),
      );
      const [row] = await tx.select().from(emailTemplate).where(where);
      if ((row?.version ?? 0) !== values.expectedVersion) throw this.conflict();
      if (row)
        await tx
          .update(emailTemplate)
          .set({ draft: values.draft, version: row.version + 1 })
          .where(where);
      else
        await tx.insert(emailTemplate).values({
          organizationId: scope.organizationId,
          key: values.key,
          draft: values.draft,
        });
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "email.template_saved",
        targetId: values.key,
      });
    });
    return this.workspace(actor);
  }
  async publishTemplate(actor: TrustedActor, raw: unknown) {
    const values = templatePublishSchema.parse(raw);
    await this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(
        actor,
        "integrations.manage",
        tx,
      );
      const where = and(
        eq(emailTemplate.organizationId, scope.organizationId),
        eq(emailTemplate.key, values.key),
      );
      const [row] = await tx.select().from(emailTemplate).where(where);
      if (!row || row.version !== values.expectedVersion) throw this.conflict();
      await tx
        .update(emailTemplate)
        .set({ published: row.draft, version: row.version + 1 })
        .where(where);
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "email.template_published",
        targetId: values.key,
      });
    });
    return this.workspace(actor);
  }
}
