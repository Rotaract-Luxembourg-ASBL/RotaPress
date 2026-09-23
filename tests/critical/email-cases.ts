import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { membership } from "../../db/schema/club";
import { calendarSubscription } from "../../db/schema/calendar";
import { emailConnection } from "../../db/schema/email";
import { EmailSettingsService } from "../../src/integrations/email/EmailSettingsService";
import { EmailDelivery } from "../../src/integrations/email/EmailDelivery";
import { ApplicationMailer } from "../../src/infrastructure/email/ApplicationMailer";
import {
  EmailTransport,
  type EmailTransportConnection,
  type OutgoingEmail,
} from "../../src/infrastructure/email/EmailTransport";
import { CredentialCipher } from "../../src/infrastructure/security/CredentialCipher";
import { CalendarEmailPreferences } from "../../src/features/calendar/CalendarEmailPreferences";
import { CalendarNotificationRunner } from "../../src/features/calendar/CalendarNotificationRunner";
import { FeatureService } from "../../src/core/features/FeatureService";
import {
  emailTemplateCatalogue,
  renderEmail,
} from "../../src/integrations/email/email_templates";
import {
  connectionSaveSchema,
  emailTemplateSchema,
} from "../../src/integrations/email/email_schemas";
import type { Context } from "./luma-sync-fixture";
import { calendarFixture } from "./calendar-cases";

const origin = "http://127.0.0.1:4100";
const local = {
  provider: "local",
  host: "127.0.0.1",
  port: 11025,
  from: { name: "Synthetic mail", address: "mail@example.test" },
} as const;
const secret = () => `re_${randomBytes(24).toString("hex")}`;
const connection = () => ({
  expectedVersion: 0,
  provider: "resend",
  name: "Synthetic delivery",
  senderName: "Synthetic sender",
  senderEmail: "sender@example.test",
  replyTo: "",
  smtp: null,
  secret: secret(),
});
export function emailServices(c: Context, enabled = true) {
  const send = vi
    .fn<
      (
        connection: EmailTransportConnection,
        message: OutgoingEmail,
      ) => Promise<void>
    >()
    .mockResolvedValue(undefined);
  const delivery = new EmailDelivery(
    c.db,
    new CredentialCipher(randomBytes(32).toString("hex")),
    { remoteEnabled: enabled, send },
    local,
  );
  const preferences = new CalendarEmailPreferences(
    c.db,
    randomBytes(32).toString("hex"),
    origin,
  );
  return {
    send,
    delivery,
    preferences,
    mailer: new ApplicationMailer(c.db, delivery, preferences),
    settings: new EmailSettingsService(c.db, c.authorization, delivery, origin),
  };
}

export function emailChecks(get: () => Context) {
  it("C13 email: keeps protected content, escapes templates and rejects injected headers or unknown variables", () => {
    const template = {
      ...emailTemplateCatalogue.calendar_update.defaults,
      body: "<script>alert(1)</script>\n\nHello {{club_name}}",
      heading: "<img src=x onerror=alert(1)>",
    };
    const rendered = renderEmail("calendar_update", template, {
      clubName: '<svg onload="alert(2)">',
      actionUrl: origin + "/calendar",
      unsubscribeUrl: origin + "/email/unsubscribe#sample",
    });
    expect(rendered.html).not.toMatch(/<script|<svg|<img/);
    expect(rendered.html).toContain("Unsubscribe from this calendar");
    expect(rendered.text).toContain(
      "Private schedule details are not included",
    );
    expect(() =>
      renderEmail("calendar_update", template, { clubName: "Synthetic" }),
    ).toThrow();
    expect(() =>
      renderEmail("calendar_update", template, {
        clubName: "Synthetic",
        actionUrl: "javascript:alert(1)",
        unsubscribeUrl: origin,
      }),
    ).toThrow();
    expect(
      emailTemplateSchema.safeParse({
        ...template,
        subject: "hello\r\nBcc: outsider@example.test",
      }).success,
    ).toBe(false);
    expect(
      emailTemplateSchema.safeParse({
        ...template,
        body: "{{participant_email}}",
      }).success,
    ).toBe(false);
    const code = renderEmail(
      "verification",
      emailTemplateCatalogue.verification.defaults,
      { clubName: "Synthetic", code: "123456" },
    );
    expect(code.text).toContain("verification code is 123456");
    expect(code.text).toContain("expires in 5 minutes");
    expect(code.html).not.toContain("Unsubscribe");
  });

  it("C13 email: encrypts multiple connections, enforces owner authority and verifies before selecting a sender", async () => {
    const c = get();
    const { owner, manager, scope } = await c.club();
    const s = emailServices(c);
    const value = connection();
    await expect(
      s.settings.saveConnection(manager, value),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      s.settings.saveConnection(
        { ...owner, authenticatedAt: new Date(0) },
        value,
      ),
    ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
    let state = await s.settings.saveConnection(owner, value);
    let first = state.connections[0];
    const [stored] = await c.db
      .select()
      .from(emailConnection)
      .where(eq(emailConnection.id, first.id));
    expect(stored.secret).not.toContain(value.secret);
    expect(JSON.stringify(state)).not.toContain(value.secret);
    expect(s.delivery.connection(stored)).toMatchObject({
      secret: value.secret,
    });
    await expect(
      s.settings.useConnection(owner, {
        id: first.id,
        expectedVersion: first.version,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_TEST_REQUIRED" });
    state = await s.settings.testConnection(owner, {
      id: first.id,
      expectedVersion: first.version,
    });
    expect(s.send).toHaveBeenCalledTimes(1);
    expect(s.send.mock.calls[0][1].to).toBe(owner.email);
    first = state.connections[0];
    state = await s.settings.useConnection(owner, {
      id: first.id,
      expectedVersion: first.version,
    });
    expect(state.localDefault).toBe(false);
    first = state.connections[0];
    await expect(
      s.settings.saveConnection(owner, {
        ...value,
        id: first.id,
        expectedVersion: first.version,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_CONNECTION_ACTIVE" });
    await expect(
      s.settings.deleteConnection(owner, {
        id: first.id,
        expectedVersion: first.version,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_CONNECTION_ACTIVE" });
    const smtp = {
      ...connection(),
      name: "Synthetic SMTP",
      provider: "smtp",
      smtp: {
        host: "smtp.provider.org",
        username: "synthetic-user",
        port: 587,
      },
    };
    state = await s.settings.saveConnection(owner, smtp);
    expect(state.connections).toHaveLength(2);
    await expect(
      c.db
        .update(emailConnection)
        .set({ isDefault: true, verifiedAt: new Date() })
        .where(eq(emailConnection.organizationId, scope.organizationId)),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    await s.mailer.sendVerificationCode(manager.email, "123456");
    expect(s.send.mock.calls.at(-1)?.[0].provider).toBe("resend");
    s.send.mockRejectedValueOnce(new Error("synthetic failure"));
    await expect(
      s.mailer.sendVerificationCode(manager.email, "123456"),
    ).rejects.toThrow();
    expect(s.send.mock.calls.at(-1)?.[0].provider).toBe("resend");
    state = await s.settings.useConnection(owner, {
      id: null,
      expectedVersion: 0,
    });
    first = state.connections.find((c) => c.id === first.id)!;
    state = await s.settings.deleteConnection(owner, {
      id: first.id,
      expectedVersion: first.version,
    });
    expect(state.connections).toHaveLength(1);
    await expect(
      s.settings.saveConnection(owner, {
        ...value,
        id: randomUUID(),
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_CONNECTION_MISSING" });
    const disabled = emailServices(c, false);
    const remaining = state.connections[0];
    await expect(
      disabled.settings.testConnection(owner, {
        id: remaining.id,
        expectedVersion: remaining.version,
      }),
    ).rejects.toMatchObject({ code: "REMOTE_EMAIL_DISABLED" });
    expect(disabled.send).not.toHaveBeenCalled();
  });

  it("C13 email: draft templates stay private to delivery until published and stale updates cannot overwrite", async () => {
    const c = get();
    const { owner, manager, scope } = await c.club();
    const s = emailServices(c);
    const draft = {
      ...emailTemplateCatalogue.verification.defaults,
      subject: "Synthetic customized sign-in",
    };
    await expect(
      s.settings.saveTemplate(manager, {
        key: "verification",
        expectedVersion: 0,
        draft,
      }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await c.db
      .update(membership)
      .set({ role: "administrator" })
      .where(
        and(
          eq(membership.userId, manager.userId),
          eq(membership.organizationId, scope.organizationId),
        ),
      );
    await s.settings.saveTemplate(
      { ...manager, authenticatedAt: new Date(0) },
      { key: "verification", expectedVersion: 0, draft },
    );
    await s.mailer.sendVerificationCode(owner.email, "123456");
    expect(s.send.mock.calls.at(-1)?.[1].subject).toBe(
      emailTemplateCatalogue.verification.defaults.subject,
    );
    await s.settings.publishTemplate(manager, {
      key: "verification",
      expectedVersion: 1,
    });
    await s.mailer.sendVerificationCode(owner.email, "123456");
    expect(s.send.mock.calls.at(-1)?.[1].subject).toBe(draft.subject);
    await expect(
      s.settings.saveTemplate(owner, {
        key: "verification",
        expectedVersion: 1,
        draft,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_SETTINGS_CHANGED" });
    await expect(
      s.settings.saveConnection(manager, connection()),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(
      s.send.mock.calls.every(([, mail]) => !mail.html.includes("Unsubscribe")),
    ).toBe(true);
  });

  it("C13 email: Resend uses the fixed endpoint, bounded request and stable retry key without exposing provider errors", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("{}", { status: 200 }));
    const resolve = vi.fn(async () => [
      { address: "93.184.215.14", family: 4 },
    ]);
    const transport = new EmailTransport(true, resolve, request);
    const destination = {
      provider: "resend",
      secret: secret(),
      from: local.from,
    } as const;
    const message = {
      to: "synthetic@example.test",
      subject: "Synthetic",
      text: "Synthetic",
      html: "<p>Synthetic</p>",
      messageId: `<synthetic-${randomUUID()}@example.test>`,
    };
    await transport.send(destination, message);
    await transport.send(destination, message);
    expect(request.mock.calls[0][0]).toBe("https://api.resend.com/emails");
    expect(request.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      method: "POST",
    });
    expect(request.mock.calls[0][1]?.headers).toEqual(
      request.mock.calls[1][1]?.headers,
    );
    expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toMatchObject({
      to: [message.to],
      html: message.html,
      text: message.text,
    });
    request.mockRejectedValueOnce(new Error("sensitive provider details"));
    await expect(transport.send(destination, message)).rejects.toThrow(
      "MAIL_DELIVERY_UNAVAILABLE",
    );
    const count = request.mock.calls.length;
    await expect(
      new EmailTransport(false, resolve, request).send(destination, message),
    ).rejects.toThrow("MAIL_DELIVERY_UNAVAILABLE");
    expect(request).toHaveBeenCalledTimes(count);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("C13 email: SMTP pins public DNS, requires TLS and blocks private destinations before connecting", async () => {
    const destination = {
      provider: "smtp",
      secret: "synthetic",
      settings: { host: "smtp.provider.org", port: 587, username: "synthetic" },
      from: local.from,
    } as const;
    const message = {
      to: "synthetic@example.test",
      subject: "Synthetic",
      text: "Synthetic",
      html: "<p>Synthetic</p>",
      messageId: `<${randomUUID()}@example.test>`,
    };
    const sendMail = vi.fn(async () => ({}));
    const close = vi.fn();
    const create = vi
      .spyOn(nodemailer, "createTransport")
      .mockReturnValue({ sendMail, close } as unknown as ReturnType<
        typeof nodemailer.createTransport
      >);
    try {
      await expect(
        new EmailTransport(true, async () => [
          { address: "127.0.0.1", family: 4 },
        ]).send(destination, message),
      ).rejects.toThrow("MAIL_DELIVERY_UNAVAILABLE");
      expect(create).not.toHaveBeenCalled();
      await new EmailTransport(true, async () => [
        { address: "93.184.215.14", family: 4 },
      ]).send(destination, message);
      expect(create.mock.calls[0][0]).toMatchObject({
        host: "93.184.215.14",
        port: 587,
        requireTLS: true,
        ignoreTLS: false,
        disableFileAccess: true,
        disableUrlAccess: true,
        tls: {
          servername: "smtp.provider.org",
          rejectUnauthorized: true,
          minVersion: "TLSv1.2",
        },
      });
      expect(close).toHaveBeenCalledOnce();
      expect(
        connectionSaveSchema.safeParse({
          ...connection(),
          provider: "smtp",
          smtp: { ...destination.settings, host: "127.0.0.1" },
        }).success,
      ).toBe(false);
    } finally {
      create.mockRestore();
    }
  });

  it("C13 email: unsubscribe capabilities stop only one calendar's email and cannot disable sign-in or a later resubscription", async () => {
    const f = await calendarFixture(get);
    const s = emailServices(f);
    const guest = await f.actor("email-guest");
    const other = await f.actor("email-other");
    const input = {
      calendarId: f.id,
      active: true,
      email: true,
      updates: true,
      reminderMinutes: 0,
    };
    await f.subscriptions.save(guest, input);
    await f.subscriptions.save(other, input);
    const [sub] = await f.db
      .select()
      .from(calendarSubscription)
      .where(eq(calendarSubscription.userId, guest.userId));
    const url = new URL(s.preferences.link(sub.id, sub.emailVersion));
    expect(url.search).toBe("");
    expect(url.pathname).toBe("/email/unsubscribe");
    const token = url.hash.slice(1);
    await expect(
      s.preferences.unsubscribe({ token: token.slice(0, -2) + "zz" }),
    ).rejects.toMatchObject({ code: "UNSUBSCRIBE_LINK_INVALID" });
    await expect(
      s.preferences.unsubscribe({ token, userId: other.userId }),
    ).rejects.toThrow();
    await s.preferences.unsubscribe({ token });
    await s.preferences.unsubscribe({ token });
    expect((await f.subscriptions.workspace(guest)).items[0]).toMatchObject({
      active: true,
      email: false,
      updates: true,
    });
    expect((await f.subscriptions.workspace(other)).items[0].email).toBe(true);
    await f.add();
    const runner = new CalendarNotificationRunner(
      f.db,
      f.reader,
      s.mailer,
      origin,
    );
    await runner.runBatch();
    expect(s.send.mock.calls.map(([, mail]) => mail.to)).toEqual([other.email]);
    expect((await f.subscriptions.workspace(guest)).notifications).toHaveLength(
      1,
    );
    await s.mailer.sendVerificationCode(guest.email, "123456");
    expect(s.send.mock.calls.at(-1)?.[1].to).toBe(guest.email);
    await f.subscriptions.save(guest, input);
    await expect(s.preferences.unsubscribe({ token })).rejects.toMatchObject({
      code: "UNSUBSCRIBE_LINK_EXPIRED",
    });
    const [renewed] = await f.db
      .select()
      .from(calendarSubscription)
      .where(eq(calendarSubscription.userId, guest.userId));
    const fresh = new URL(
      s.preferences.link(renewed.id, renewed.emailVersion),
    ).hash.slice(1);
    await new FeatureService(f.db, f.authorization).configure(f.owner, {
      key: "calendar",
      enabled: false,
      expectedVersion: 0,
      confirmed: true,
    });
    await s.preferences.unsubscribe({ token: fresh });
    expect(
      (
        await f.db
          .select()
          .from(calendarSubscription)
          .where(eq(calendarSubscription.id, renewed.id))
      )[0].email,
    ).toBe(false);
  });
}
