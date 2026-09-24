import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { installation, membership } from "../../db/schema/club";
import type { Database } from "../../src/infrastructure/database/client";
import type { TrustedActor } from "../../src/core/authorization/AuthorizationService";
import { CredentialCipher } from "../../src/infrastructure/security/CredentialCipher";
import { EmailDelivery } from "../../src/integrations/email/EmailDelivery";
import { ApplicationMailer } from "../../src/infrastructure/email/ApplicationMailer";
import { CalendarEmailPreferences } from "../../src/features/calendar/CalendarEmailPreferences";

export function installationEmailChecks(
  get: () => {
    db: Database;
    actor: (label: string) => Promise<TrustedActor>;
    prepareClaim: (actor: TrustedActor) => Promise<unknown>;
  },
) {
  it("C01 email: only an unexpired nominated owner receives bootstrap email; no owner authority is granted by sending", async () => {
    const { db, actor, prepareClaim } = get();
    const owner = await actor("email-owner");
    const outsider = await actor("email-outsider");
    const send = vi.fn(async () => {});
    const cipher = new CredentialCipher(randomBytes(32).toString("hex"));
    const preferences = new CalendarEmailPreferences(
      db,
      randomBytes(32).toString("hex"),
      "http://127.0.0.1:3000",
    );
    const connection = {
      provider: "resend" as const,
      secret: `re_${randomBytes(24).toString("hex")}`,
      from: { name: "Synthetic", address: "sender@example.test" },
    };
    const delivery = new EmailDelivery(
      db,
      cipher,
      { remoteEnabled: true, send },
      connection,
    );
    const mailer = new ApplicationMailer(db, delivery, preferences);
    await expect(
      mailer.sendVerificationCode(owner.email, "123456"),
    ).rejects.toMatchObject({ code: "SETUP_EMAIL_UNAVAILABLE" });
    await prepareClaim(owner);
    await expect(
      mailer.sendVerificationCode(outsider.email, "123456"),
    ).rejects.toMatchObject({ code: "SETUP_EMAIL_UNAVAILABLE" });
    expect(send).not.toHaveBeenCalled();
    await mailer.sendVerificationCode(owner.email, "123456");
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ to: owner.email }),
    );
    expect(await db.select().from(membership)).toHaveLength(0);
    await db
      .update(installation)
      .set({ claimExpiresAt: new Date(0) })
      .where(eq(installation.id, 1));
    await expect(
      mailer.sendVerificationCode(owner.email, "123456"),
    ).rejects.toMatchObject({ code: "SETUP_EMAIL_UNAVAILABLE" });
    expect(send).toHaveBeenCalledOnce();

    const unconfigured = new EmailDelivery(
      db,
      cipher,
      { remoteEnabled: true, send },
      null,
    );
    await expect(
      unconfigured.send(
        {
          to: owner.email,
          subject: "Synthetic",
          text: "Synthetic",
          html: "Synthetic",
          messageId: "<synthetic@example.test>",
        },
        null,
      ),
    ).rejects.toMatchObject({ code: "EMAIL_SETUP_REQUIRED" });
    expect(send).toHaveBeenCalledOnce();
    expect(JSON.stringify(delivery.serverStatus())).not.toContain(
      connection.secret,
    );
    const disabled = new EmailDelivery(
      db,
      cipher,
      { remoteEnabled: false, send },
      connection,
    );
    expect(() => disabled.requireServerConnection()).toThrow();
    expect(disabled.serverStatus().ready).toBe(false);
  });
}
