import "server-only";
import { config } from "@/core/config";
import { db } from "@/infrastructure/database/client";
import { CredentialCipher } from "@/infrastructure/security/CredentialCipher";
import { EmailTransport } from "@/infrastructure/email/EmailTransport";
import { ApplicationMailer } from "@/infrastructure/email/ApplicationMailer";
import { EmailDelivery } from "@/integrations/email/EmailDelivery";
import { CalendarEmailPreferences } from "@/features/calendar/CalendarEmailPreferences";

export const emailDelivery = new EmailDelivery(
  db,
  new CredentialCipher(config.INTEGRATION_ENCRYPTION_KEY),
  new EmailTransport(config.EMAIL_REMOTE_DELIVERY_ENABLED === "true"),
  {
    provider: "local",
    host: "127.0.0.1",
    port: 11025,
    from: {
      name: "RotaPress",
      address: "noreply@example.test",
    },
  },
);
export const calendarEmailPreferences = new CalendarEmailPreferences(
  db,
  config.BETTER_AUTH_SECRET,
  config.APP_URL,
);
export const mailer = new ApplicationMailer(
  db,
  emailDelivery,
  calendarEmailPreferences,
);
