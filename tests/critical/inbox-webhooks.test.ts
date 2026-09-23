import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { parseEnv } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { user } from "../../db/schema/auth";
import { auditEntry, membership } from "../../db/schema/club";
import { clubEvent } from "../../db/schema/events";
import {
  formWebhook,
  formWebhookDelivery,
} from "../../db/schema/form-webhooks";
import { formSubmission } from "../../db/schema/forms";
import {
  AuthorizationService,
  type TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { FeatureService } from "../../src/core/features/FeatureService";
import { InstallationService } from "../../src/core/installation/InstallationService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { EventService } from "../../src/features/events/EventService";
import { FormService } from "../../src/features/forms/FormService";
import { FormNotificationRunner } from "../../src/features/forms/FormNotificationRunner";
import { FormWebhookRunner } from "../../src/features/forms/FormWebhookRunner";
import { FormWebhookService } from "../../src/features/forms/FormWebhookService";
import { InboxService } from "../../src/features/forms/InboxService";
import { SubmissionService } from "../../src/features/forms/SubmissionService";
import { MembershipService } from "../../src/features/members/MembershipService";
import type { Database } from "../../src/infrastructure/database/client";
import {
  WebhookClient,
  type WebhookSender,
} from "../../src/infrastructure/http/WebhookClient";
import { CredentialCipher } from "../../src/infrastructure/security/CredentialCipher";

let runtimePool: Pool;
let migrationPool: Pool;
let db: Database;
let authorization: AuthorizationService;
let forms: FormService;
let submissions: SubmissionService;
let inbox: InboxService;
let hooks: FormWebhookService;
let features: FeatureService;
let cipher: CredentialCipher;
let receiver: Server;
let receiverUrl: string;
let failDelivery = false;
let received: { body: string; headers: IncomingHttpHeaders }[] = [];
const endpoint = "https://example.org/rotapress";
const appUrl = "http://127.0.0.1:3000";
const answers = {
  name: "Synthetic visitor",
  email: "synthetic-visitor@example.test",
  message: "Synthetic private message for inbox checks",
};
const eventFields = {
  title: "Synthetic inbox event",
  description: "Synthetic public event",
  startsAt: "2026-12-05T12:00:00Z",
  endsAt: null,
  timezone: "Europe/Luxembourg",
  venue: "Synthetic hall",
  visibility: "public" as const,
};
const sender: WebhookSender = {
  enabled: true,
  async send(_endpoint, body, headers) {
    // The production endpoint stays valid; only this injected transport uses loopback.
    const response = await fetch(receiverUrl, {
      method: "POST",
      body,
      headers,
    });
    await response.text();
    if (!response.ok) throw new Error("SYNTHETIC_RECEIVER_UNAVAILABLE");
  },
};

function testConnection(value: string | undefined) {
  if (!value) throw new Error("Run setup before critical checks.");
  const target = new URL(value);
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.pathname !== "/rotapress_test"
  )
    throw new Error("Inbox checks require the disposable local test database.");
  return value;
}

async function actor(label: string): Promise<TrustedActor> {
  // Service-only synthetic fixture; browser coverage uses real Better Auth OTP.
  const userId = randomUUID();
  const email = `${label}-${userId}@example.test`;
  await db.insert(user).values({
    id: userId,
    name: `Synthetic ${label}`,
    email,
    emailVerified: true,
  });
  return {
    userId,
    email,
    emailVerified: true,
    sessionId: randomUUID(),
    authenticatedAt: new Date(),
    authMethod: "email-otp",
  };
}

async function club() {
  const owner = await actor("inbox-owner");
  const claim = randomBytes(32).toString("hex");
  await migrationPool.query(
    "INSERT INTO club.installation (id, nominated_email, claim_hash, claim_expires_at) VALUES (1, $1, $2, $3)",
    [
      owner.email,
      createHash("sha256").update(claim).digest("hex"),
      new Date(Date.now() + 60000),
    ],
  );
  await new InstallationService(db).complete(owner, {
    claim,
    name: "Synthetic Inbox Club",
    tagline: "",
    description: "",
    locale: "en",
    timezone: "Europe/Luxembourg",
    accentColor: "#25636b",
  });
  return { owner, scope: await authorization.require(owner, "forms.edit") };
}

async function contact(owner: TrustedActor) {
  const draft = await forms.create(owner, { kind: "contact" });
  await forms.publish(owner, draft.id, {
    expectedRevision: draft.draftRevision,
  });
  return forms.publicForm(draft.id);
}

async function eventForm(owner: TrustedActor, manager: TrustedActor) {
  const events = new EventService(db, authorization);
  const modules = new EventModuleService(db, events);
  let event = await events.create(owner, {
    ...eventFields,
    managerUserId: manager.userId,
  });
  for (const key of ["website", "forms"] as const) {
    event = await modules.change(manager, {
      id: event.id,
      expectedVersion: event.version,
      key,
      operation: "enable",
      confirmed: true,
    });
  }
  // Deliberate published-event fixture; browser journeys exercise CMS publication.
  await db
    .update(clubEvent)
    .set({ published: eventFields, publishedAt: new Date() })
    .where(eq(clubEvent.id, event.id));
  const draft = await forms.createEventForm(manager, event.id, {
    kind: "event",
    title: "Synthetic event enquiries",
  });
  await forms.publish(manager, draft.id, {
    expectedRevision: draft.draftRevision,
  });
  return { event, events, modules, form: await forms.publicForm(draft.id) };
}

async function submit(form: { id: string; versionId: string }) {
  return submissions.submit(null, form.id, {
    versionId: form.versionId,
    requestId: randomUUID(),
    answers,
  });
}

async function configure(
  owner: TrustedActor,
  formId: string,
  extra: object = {},
) {
  const current = await hooks.settings(owner, formId);
  return hooks.save(owner, formId, {
    expectedRevision: current.revision,
    endpoint,
    enabled: true,
    ...(current.configured ? {} : { secret: randomBytes(32).toString("hex") }),
    ...extra,
  });
}

beforeAll(async () => {
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  runtimePool = new Pool({
    connectionString: testConnection(env.DATABASE_URL),
    max: 5,
  });
  migrationPool = new Pool({
    connectionString: testConnection(env.TEST_MIGRATION_DATABASE_URL),
    max: 2,
  });
  db = drizzle(runtimePool, { schema });
  authorization = new AuthorizationService(db);
  forms = new FormService(db, authorization);
  submissions = new SubmissionService(
    db,
    authorization,
    new MembershipService(db, authorization),
  );
  inbox = new InboxService(db, authorization);
  cipher = new CredentialCipher(randomBytes(32).toString("hex"));
  hooks = new FormWebhookService(db, authorization, cipher, true);
  features = new FeatureService(db, authorization);
  receiver = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    received.push({
      body: Buffer.concat(chunks).toString("utf8"),
      headers: request.headers,
    });
    response.writeHead(failDelivery ? 503 : 204);
    response.end();
  });
  await new Promise<void>((resolve) =>
    receiver.listen(0, "127.0.0.1", resolve),
  );
  const address = receiver.address();
  if (!address || typeof address === "string")
    throw new Error("Synthetic receiver unavailable.");
  receiverUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await migrationPool.query(
    'TRUNCATE club.installation, club.organization, club.membership, club.audit_entry, club."user" CASCADE',
  );
  received = [];
  failDelivery = false;
});

afterAll(async () => {
  if (receiver)
    await new Promise<void>((resolve, reject) =>
      receiver.close((error) => (error ? reject(error) : resolve())),
    );
  await Promise.all([runtimePool?.end(), migrationPool?.end()]);
});

describe("C05 inbox and outbound webhook boundaries", () => {
  it("enforces global or assigned-event response scope and keeps claimed contact details distinct from verified identity", async () => {
    const { owner, scope } = await club();
    const editor = await actor("inbox-editor");
    const outsider = await actor("inbox-outsider");
    const manager = await actor("event-manager");
    for (const [person, role] of [
      [editor, "editor"],
      [manager, "member"],
    ] as const) {
      await db.insert(membership).values({
        organizationId: scope.organizationId,
        userId: person.userId,
        role,
        status: "approved",
      });
    }
    const published = await contact(owner);
    // Signing in does not verify a contact form's self-reported identity.
    const receipt = await submissions.submit(owner, published.id, {
      versionId: published.versionId,
      requestId: randomUUID(),
      answers,
    });
    const ownEvent = await eventForm(owner, manager);
    const eventReceipt = await submit(ownEvent.form);
    const otherEvent = await eventForm(owner, owner);
    await submit(otherEvent.form);
    const assignment = await ownEvent.events.detail(owner, ownEvent.event.id);
    await ownEvent.events.changeEditor(owner, {
      id: assignment.id,
      expectedVersion: assignment.version,
      userId: editor.userId,
      operation: "grant",
      confirmed: true,
    });
    expect(await ownEvent.events.hasAccess(editor)).toBe(true);
    expect(await ownEvent.events.hasResponseAccess(manager)).toBe(true);
    expect(await ownEvent.events.hasResponseAccess(editor)).toBe(false);
    expect(await ownEvent.events.hasResponseAccess(null)).toBe(false);
    for (const person of [editor, outsider]) {
      await expect(inbox.list(person)).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
    }
    const assigned = await inbox.list(manager);
    expect(assigned.messages.map((item) => item.id)).toEqual([eventReceipt.id]);
    expect(
      assigned.forms.every((item) => item.eventId === ownEvent.event.id),
    ).toBe(true);
    expect((await inbox.list(manager, { formId: published.id })).total).toBe(0);
    expect(
      (await inbox.list(manager, { formId: otherEvent.form.id })).total,
    ).toBe(0);
    expect(
      (await submissions.list(manager, ownEvent.form.id)).submissions,
    ).toHaveLength(1);
    await expect(submissions.detail(manager, receipt.id)).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(
      submissions.list(manager, otherEvent.form.id),
    ).rejects.toMatchObject({ status: 404 });
    const page = await inbox.list(owner, {
      formId: published.id,
      q: "private message",
    });
    expect(page.messages).toEqual([
      expect.objectContaining({
        id: receipt.id,
        formId: published.id,
        eventId: null,
        name: answers.name,
        email: answers.email,
        verified: false,
        status: "new",
        preview: answers.message,
      }),
    ]);
    expect(page.messages[0]).not.toHaveProperty("answers");
    expect(
      (await inbox.list(owner, { formId: randomUUID() })).messages,
    ).toEqual([]);
    await expect(
      inbox.list(owner, { organizationId: randomUUID() }),
    ).rejects.toThrow();
    const application = await forms.create(owner, { kind: "membership" });
    await forms.publish(owner, application.id, {
      expectedRevision: application.draftRevision,
    });
    const publicApplication = await forms.publicForm(application.id);
    const applicationReceipt = await submissions.submit(
      outsider,
      application.id,
      {
        versionId: publicApplication.versionId,
        requestId: randomUUID(),
        answers: {
          name: "Synthetic applicant",
          motivation: "Synthetic interest",
        },
      },
    );
    expect(
      (await inbox.list(owner, { formId: application.id })).messages[0],
    ).toMatchObject({
      id: applicationReceipt.id,
      email: outsider.email,
      verified: true,
    });
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, outsider.userId));
    expect(
      (await inbox.list(owner, { formId: application.id })).messages[0]
        .verified,
    ).toBe(false);
    await expect(inbox.list(outsider)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await submissions.updateStatus(owner, receipt.id, { status: "closed" });
    expect(
      (await inbox.list(owner, { status: "closed" })).messages.map(
        (item) => item.id,
      ),
    ).toEqual([receipt.id]);
    expect((await inbox.list(owner)).messages).toHaveLength(4);
    await features.configure(owner, {
      key: "events",
      expectedVersion: 0,
      enabled: false,
      confirmed: true,
    });
    const withoutEvents = await inbox.list(owner);
    expect(withoutEvents.messages.map((item) => item.id).sort()).toEqual(
      [receipt.id, applicationReceipt.id].sort(),
    );
    expect(withoutEvents.forms.map((item) => item.id).sort()).toEqual(
      [published.id, application.id].sort(),
    );
    expect(
      withoutEvents.messages.some((item) => item.id === eventReceipt.id),
    ).toBe(false);
    await features.configure(owner, {
      key: "forms",
      expectedVersion: 0,
      enabled: false,
      confirmed: true,
    });
    await expect(inbox.list(owner)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
  });

  it("scopes settings, encrypts signing secrets and retries one immutable response notification with a stable identity", async () => {
    const { owner, scope } = await club();
    const editor = await actor("hook-editor");
    await db.insert(membership).values({
      organizationId: scope.organizationId,
      userId: editor.userId,
      role: "editor",
      status: "approved",
    });
    const published = await contact(owner);
    const other = await contact(owner);
    const secret = randomBytes(32).toString("hex");
    const settings = await configure(owner, published.id, { secret });
    expect(Object.keys(settings).includes("secret")).toBe(false);
    expect(JSON.stringify(settings).includes(secret)).toBe(false);
    expect(settings).toMatchObject({
      configured: true,
      enabled: true,
      revision: 1,
      secretConfigured: true,
    });
    const [stored] = await db.select().from(formWebhook);
    expect(stored.secret === secret).toBe(false);
    expect(
      cipher.open(
        stored.secret,
        `form-webhook:${scope.organizationId}:${stored.id}`,
      ) === secret,
    ).toBe(true);
    expect(() =>
      cipher.open(stored.secret, `form-webhook:${randomUUID()}:${stored.id}`),
    ).toThrow();
    expect(
      JSON.stringify(await db.select().from(auditEntry)).includes(secret),
    ).toBe(false);
    for (const action of [
      () => hooks.settings(editor, published.id),
      () =>
        hooks.save(editor, published.id, {
          expectedRevision: 1,
          endpoint,
          enabled: true,
        }),
    ])
      await expect(action()).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(hooks.settings(owner, randomUUID())).rejects.toMatchObject({
      code: "FORM_NOT_FOUND",
    });
    await expect(
      hooks.save(owner, published.id, {
        expectedRevision: 0,
        endpoint,
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "WEBHOOK_CHANGED" });
    for (const invalid of [
      "",
      "not a URL",
      "http://example.org/hook",
      "https://127.0.0.1/hook",
      "https://receiver.test/hook",
      "https://user:password@example.org/hook",
      "https://example.org/hook?token=secret",
    ]) {
      await expect(
        hooks.save(owner, published.id, {
          expectedRevision: 1,
          endpoint: invalid,
          enabled: true,
        }),
      ).rejects.toMatchObject({ name: "ZodError" });
    }
    await expect(
      hooks.save(owner, published.id, {
        expectedRevision: 1,
        endpoint,
        enabled: true,
        organizationId: randomUUID(),
      }),
    ).rejects.toThrow();
    const input = {
      versionId: published.versionId,
      requestId: randomUUID(),
      answers,
    };
    const receipts = await Promise.all([
      submissions.submit(null, published.id, input),
      submissions.submit(null, published.id, input),
    ]);
    expect(new Set(receipts.map((receipt) => receipt.id)).size).toBe(1);
    expect(await db.select().from(formWebhookDelivery)).toHaveLength(1);
    const otherReceipt = await submit(other);
    await expect(
      runtimePool.query(
        "INSERT INTO club.form_webhook_delivery (organization_id, form_id, submission_id, webhook_id, revision) VALUES ($1, $2, $3, $4, 1)",
        [scope.organizationId, published.id, otherReceipt.id, stored.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    const edited = await forms.detail(owner, published.id);
    const updated = await forms.save(owner, published.id, {
      expectedRevision: edited.draftRevision,
      definition: { ...edited.draft, title: "Changed after response" },
    });
    await forms.publish(owner, published.id, {
      expectedRevision: updated.draftRevision,
    });
    // Removal blocks new submissions; accepted responses retain notification eligibility.
    await forms.archive(owner, published.id, {
      expectedRevision: updated.draftRevision,
      archived: true,
    });
    await expect(forms.publicForm(published.id)).rejects.toMatchObject({
      code: "FORM_NOT_FOUND",
    });
    failDelivery = true;
    const runner = new FormWebhookRunner(db, cipher, sender, appUrl);
    expect(await runner.runBatch()).toMatchObject({
      processed: 1,
      sent: 0,
      deferred: 1,
    });
    expect((await submissions.detail(owner, receipts[0].id)).answers).toEqual(
      answers,
    );
    const [job] = await db.select().from(formWebhookDelivery);
    expect(job).toMatchObject({
      status: "pending",
      attempts: 1,
      lastErrorCode: "WEBHOOK_DELIVERY_FAILED",
    });
    await db
      .update(formWebhookDelivery)
      .set({ status: "failed", attempts: 5 })
      .where(eq(formWebhookDelivery.id, job.id));
    await expect(
      hooks.retry(editor, published.id, { deliveryId: job.id }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      hooks.retry(owner, published.id, { deliveryId: randomUUID() }),
    ).rejects.toMatchObject({ code: "WEBHOOK_RETRY_UNAVAILABLE" });
    await hooks.retry(owner, published.id, { deliveryId: job.id });
    failDelivery = false;
    expect(await runner.runBatch()).toMatchObject({ processed: 1, sent: 1 });
    expect(await runner.runBatch()).toMatchObject({ processed: 0 });
    expect(JSON.stringify(received).includes(secret)).toBe(false);
    expect(received.length).toBe(2);
    expect(received[0].body === received[1].body).toBe(true);
    for (const attempt of received) {
      expect(attempt.headers["x-rotapress-id"]).toBe(job.id);
      expect(
        attempt.headers["x-rotapress-signature"] ===
          `v1=${createHmac("sha256", secret).update(`${attempt.headers["x-rotapress-timestamp"]}.${attempt.body}`).digest("hex")}`,
      ).toBe(true);
      expect(JSON.parse(attempt.body)).toEqual({
        id: job.id,
        type: "form.response.created",
        createdAt: receipts[0].receivedAt,
        data: {
          formId: published.id,
          submissionId: receipts[0].id,
          versionId: published.versionId,
          eventId: null,
          url: `${appUrl}/admin/forms/${published.id}/submissions/${receipts[0].id}`,
        },
      });
      for (const privateValue of Object.values(answers))
        expect(attempt.body).not.toContain(privateValue);
      expect(attempt.body.includes(secret)).toBe(false);
    }
    expect(
      (await hooks.settings(owner, published.id)).deliveries[0],
    ).toMatchObject({
      id: job.id,
      status: "sent",
      attempts: 1,
      errorCode: null,
    });
    await expect(
      hooks.retry(owner, published.id, { deliveryId: job.id }),
    ).rejects.toMatchObject({ code: "WEBHOOK_RETRY_UNAVAILABLE" });
  });

  it("cancels pending deliveries on pause, destination revision or feature disable without replaying them after re-enable", async () => {
    const { owner, scope } = await club();
    const published = await contact(owner);
    await configure(owner, published.id);
    const runner = new FormWebhookRunner(db, cipher, sender, appUrl);
    const paused = await submit(published);
    await configure(owner, published.id, { enabled: false });
    await configure(owner, published.id);
    expect(await runner.runBatch()).toMatchObject({ processed: 0 });
    expect(
      (await hooks.settings(owner, published.id)).deliveries.find(
        (item) => item.submissionId === paused.id,
      ),
    ).toMatchObject({
      status: "cancelled",
      errorCode: "CONFIGURATION_CHANGED",
    });
    const cancelled = (await hooks.settings(owner, published.id)).deliveries[0];
    await expect(
      hooks.retry(owner, published.id, { deliveryId: cancelled.id }),
    ).rejects.toMatchObject({ code: "WEBHOOK_RETRY_UNAVAILABLE" });
    const revised = await submit(published);
    await configure(owner, published.id, {
      endpoint: "https://example.org/new-destination",
    });
    expect(await runner.runBatch()).toMatchObject({ processed: 0 });
    expect(
      (await hooks.settings(owner, published.id)).deliveries.find(
        (item) => item.submissionId === revised.id,
      ),
    ).toMatchObject({ status: "cancelled" });
    const disabled = await submit(published);
    await features.configure(owner, {
      key: "forms",
      expectedVersion: 0,
      enabled: false,
      confirmed: true,
    });
    await features.configure(owner, {
      key: "forms",
      expectedVersion: 1,
      enabled: true,
      confirmed: true,
    });
    expect(await runner.runBatch()).toMatchObject({ processed: 0 });
    expect(
      (await hooks.settings(owner, published.id)).deliveries.find(
        (item) => item.submissionId === disabled.id,
      ),
    ).toMatchObject({
      status: "cancelled",
      errorCode: "DELIVERY_NO_LONGER_AUTHORIZED",
    });
    await submit(published);
    expect(await runner.runBatch()).toMatchObject({ processed: 1, sent: 1 });
    const manager = await actor("hook-event-manager");
    await db.insert(membership).values({
      organizationId: scope.organizationId,
      userId: manager.userId,
      role: "member",
      status: "approved",
    });
    const own = await eventForm(owner, manager);
    const other = await eventForm(owner, owner);
    await configure(manager, own.form.id);
    await expect(hooks.settings(manager, other.form.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(configure(manager, published.id)).rejects.toMatchObject({
      status: 403,
    });
    await forms.updateSettings(manager, own.form.id, {
      recipients: ["synthetic-reviewer@example.test"],
      retentionDays: null,
    });
    const emails: string[] = [];
    const emailRunner = new FormNotificationRunner(
      db,
      {
        async sendSubmissionNotification(_to, link) {
          emails.push(link);
        },
      },
      appUrl,
    );
    const eventReceipt = await submit(own.form);
    await own.modules.change(manager, {
      id: own.event.id,
      expectedVersion: (await own.events.detail(manager, own.event.id)).version,
      key: "forms",
      operation: "disable",
      confirmed: true,
    });
    // No worker observes the disabled state: the persisted disable time must fence old jobs.
    await own.modules.change(manager, {
      id: own.event.id,
      expectedVersion: (await own.events.detail(manager, own.event.id)).version,
      key: "forms",
      operation: "enable",
      confirmed: true,
    });
    expect(await runner.runBatch()).toMatchObject({ processed: 0 });
    expect(await emailRunner.runBatch()).toMatchObject({ sent: 0 });
    expect(
      (await hooks.settings(manager, own.form.id)).deliveries.find(
        (item) => item.submissionId === eventReceipt.id,
      ),
    ).toMatchObject({ status: "cancelled" });
    expect(received.length).toBe(1);
    expect(emails).toEqual([]);
    const fresh = await submit(own.form);
    expect(await runner.runBatch()).toMatchObject({ processed: 1, sent: 1 });
    expect(await emailRunner.runBatch()).toMatchObject({ sent: 1 });
    expect(received.length).toBe(2);
    expect(JSON.parse(received[1].body).data.submissionId).toBe(fresh.id);
    expect(emails).toEqual([
      `${appUrl}/admin/forms/${own.form.id}/submissions/${fresh.id}`,
    ]);
    expect(await db.select().from(formSubmission)).toHaveLength(6);
  });

  it("rejects private or mixed DNS answers before connecting and honors disabled outbound delivery", async () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "0.0.0.0",
    ]) {
      const client = new WebhookClient(true, async () => [
        { address, family: 4 },
      ]);
      await expect(client.send(endpoint, "{}", {})).rejects.toThrow(
        "WEBHOOK_ADDRESS_BLOCKED",
      );
    }
    await expect(
      new WebhookClient(true, async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]).send(endpoint, "{}", {}),
    ).rejects.toThrow("WEBHOOK_ADDRESS_BLOCKED");
    await expect(
      new WebhookClient(false, async () => {
        throw new Error("DNS must not run");
      }).send(endpoint, "{}", {}),
    ).rejects.toThrow("WEBHOOK_DELIVERY_DISABLED");
    expect(received.length).toBe(0);
  });
});
