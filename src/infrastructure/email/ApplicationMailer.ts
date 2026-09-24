import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { DomainError } from "@/core/DomainError";
import { installation, organization } from "../../../db/schema/club";
import { EmailTemplateReader } from "@/integrations/email/EmailTemplateReader";
import type { Database } from "../database/client";
import type { EmailDelivery } from "@/integrations/email/EmailDelivery";
import type { CalendarEmailPreferences } from "@/features/calendar/CalendarEmailPreferences";
import {
  emailTemplateCatalogue,
  renderEmail,
} from "@/integrations/email/email_templates";
import type {
  EmailTemplateKey,
  EmailTemplateTarget,
} from "@/integrations/email/email_schemas";

/** One application mailer for Better Auth, forms and Calendar; transport details stay outside features. */
export class ApplicationMailer {
  constructor(
    private readonly db: Database,
    private readonly delivery: EmailDelivery,
    private readonly preferences: CalendarEmailPreferences,
  ) {}
  private async send(
    email: string,
    key: EmailTemplateKey,
    messageId: string,
    content: { code?: string; actionUrl?: string; unsubscribeUrl?: string },
    target?: EmailTemplateTarget,
  ) {
    const [club] = await this.db
      .select({ id: organization.id, name: organization.name })
      .from(installation)
      .innerJoin(organization, eq(organization.id, installation.organizationId))
      .where(eq(installation.id, 1));
    const template = club
      ? await new EmailTemplateReader(this.db).resolve(club.id, key, target)
      : emailTemplateCatalogue[key].defaults;
    await this.delivery.send(
      {
        to: email,
        messageId,
        ...renderEmail(key, template, {
          ...content,
          clubName: club?.name ?? "RotaPress",
        }),
      },
      club?.id ?? null,
    );
  }
  async sendVerificationCode(email: string, code: string) {
    const [state] = await this.db
      .select()
      .from(installation)
      .where(eq(installation.id, 1));
    if (!state?.completedAt) {
      this.delivery.requireServerConnection();
      if (
        !state?.claimHash ||
        !state.claimExpiresAt ||
        state.claimExpiresAt.getTime() <= Date.now() ||
        state.nominatedEmail.toLowerCase() !== email.trim().toLowerCase()
      )
        throw new DomainError(
          "SETUP_EMAIL_UNAVAILABLE",
          "Owner sign-in is unavailable for this address or the setup claim has expired. Contact the server administrator.",
          409,
        );
    }
    return this.send(
      email,
      "verification",
      `<signin-${randomUUID()}@rotapress.local>`,
      { code },
    );
  }
  sendSubmissionNotification(
    email: string,
    administrationUrl: string,
    messageId: string,
    formId: string,
  ) {
    return this.send(
      email,
      "form_submission",
      messageId,
      {
        actionUrl: administrationUrl,
      },
      { kind: "form", id: formId },
    );
  }
  sendCalendarNotification(
    email: string,
    kind: "update" | "reminder",
    calendarUrl: string,
    messageId: string,
    subscription: { id: string; emailVersion: string; calendarId: string },
  ) {
    return this.send(
      email,
      kind === "update" ? "calendar_update" : "calendar_reminder",
      messageId,
      {
        actionUrl: calendarUrl,
        unsubscribeUrl: this.preferences.link(
          subscription.id,
          subscription.emailVersion,
        ),
      },
      { kind: "calendar", id: subscription.calendarId },
    );
  }
}
