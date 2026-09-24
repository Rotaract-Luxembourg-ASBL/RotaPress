import { randomBytes } from "node:crypto";
import { expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { serverEmailConfiguration } from "../../src/infrastructure/email/server_email_configuration";
import { EmailTransport } from "../../src/infrastructure/email/EmailTransport";
import {
  sendVerificationEmail,
  withVerificationDelivery,
} from "../../src/core/auth/verification_delivery";
import { DomainError } from "../../src/core/DomainError";

const origin = "http://127.0.0.1:3000";
const database = "postgresql://rotapress_app@127.0.0.1:55432/rotapress_test";

it("reports callback delivery failures without leaking details or crossing concurrent auth requests", async () => {
  let release: () => void = () => {};
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const failed = withVerificationDelivery(async () => {
    await sendVerificationEmail(async () => {
      await barrier;
      throw new Error("sensitive provider credential or recipient");
    });
    return Response.json({ success: true });
  });
  const successful = await withVerificationDelivery(async () => {
    await sendVerificationEmail(async () => {});
    return Response.json({ success: true });
  });
  release();
  const failure = await failed;
  expect(successful.status).toBe(200);
  expect(await successful.json()).toEqual({ success: true });
  expect(failure.status).toBe(422);
  expect(failure.headers.get("cache-control")).toContain("no-store");
  expect(await failure.text()).not.toContain("sensitive provider");
  const refused = await withVerificationDelivery(async () => {
    await sendVerificationEmail(async () => {
      throw new DomainError(
        "EMAIL_SETUP_REQUIRED",
        "Configure a sender first.",
        409,
      );
    });
    return Response.json({ success: true });
  });
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({ code: "EMAIL_SETUP_REQUIRED" });
});

it("production defaults to no sender and rejects development capture even on loopback", () => {
  expect(serverEmailConfiguration({}, origin, database)).toEqual({
    connection: null,
    remoteEnabled: false,
    localEnabled: false,
  });
  for (const environment of [undefined, "production"]) {
    expect(() =>
      serverEmailConfiguration(
        {
          EMAIL_PROVIDER: "development",
          ROTAPRESS_ENVIRONMENT: environment,
        },
        origin,
        database,
      ),
    ).toThrow("Development email requires");
  }
  expect(() =>
    serverEmailConfiguration(
      {
        EMAIL_PROVIDER: "development",
        ROTAPRESS_ENVIRONMENT: "development",
      },
      "https://club.example.org",
      database,
    ),
  ).toThrow();
  expect(() =>
    serverEmailConfiguration(
      {
        EMAIL_PROVIDER: "development",
        ROTAPRESS_ENVIRONMENT: "test",
      },
      origin,
      database.replace("rotapress_test", "rotapress"),
    ),
  ).toThrow();
  expect(
    serverEmailConfiguration(
      {
        EMAIL_PROVIDER: "development",
        ROTAPRESS_ENVIRONMENT: "test",
      },
      origin,
      database,
    ),
  ).toMatchObject({ localEnabled: true, remoteEnabled: false });
});

it("bootstraps SMTP or Resend without an organization and rejects malformed settings without echoing secrets", () => {
  const key = `re_${randomBytes(24).toString("hex")}`;
  const resend = {
    EMAIL_PROVIDER: "resend",
    EMAIL_FROM_ADDRESS: "sender@club.example.org",
    EMAIL_FROM_NAME: "My club",
    RESEND_API_KEY: key,
    EMAIL_REMOTE_DELIVERY_ENABLED: "true",
  };
  expect(serverEmailConfiguration(resend, origin, database)).toMatchObject({
    connection: { provider: "resend", secret: key },
    remoteEnabled: true,
    localEnabled: false,
  });
  expect(
    serverEmailConfiguration(
      {
        ...resend,
        EMAIL_PROVIDER: "smtp",
        SMTP_HOST: "smtp.provider.org",
        SMTP_PORT: "465",
        SMTP_USERNAME: "synthetic",
        SMTP_PASSWORD: "synthetic#password",
      },
      origin,
      database,
    ),
  ).toMatchObject({
    connection: { provider: "smtp", settings: { port: 465 } },
    localEnabled: false,
  });
  for (const overrides of [
    { EMAIL_FROM_NAME: "injected\r\nBcc: outsider@example.test" },
    { RESEND_API_KEY: "invalid" },
    { EMAIL_PROVIDER: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: "25" },
  ]) {
    expect(() =>
      serverEmailConfiguration({ ...resend, ...overrides }, origin, database),
    ).toThrow("Server email configuration is incomplete or invalid.");
  }
});

it("transport refuses local delivery by default before creating any SMTP connection", async () => {
  const create = vi.spyOn(nodemailer, "createTransport");
  try {
    await expect(
      new EmailTransport(true).send(
        {
          provider: "local",
          host: "127.0.0.1",
          port: 11025,
          from: { name: "Synthetic", address: "sender@example.test" },
        },
        {
          to: "owner@example.test",
          subject: "Synthetic",
          text: "Synthetic",
          html: "Synthetic",
          messageId: "<synthetic@example.test>",
        },
      ),
    ).rejects.toThrow("MAIL_DELIVERY_UNAVAILABLE");
    expect(create).not.toHaveBeenCalled();
  } finally {
    create.mockRestore();
  }
});
