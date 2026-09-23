import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { user } from "../../db/schema/auth";
import { membership } from "../../db/schema/club";
import { formNotification, formSubmission } from "../../db/schema/forms";
import {
  AuthorizationService,
  type TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { InstallationService } from "../../src/core/installation/InstallationService";
import {
  FormNotificationRunner,
  FormService,
  SubmissionService,
} from "../../src/features/forms";
import { csvCell } from "../../src/features/forms/form_answers";
import {
  formDefinitionSchema,
  type FormDefinition,
} from "../../src/features/forms/form_schemas";
import { MembershipService } from "../../src/features/members/MembershipService";
import type { Database } from "../../src/infrastructure/database/client";
import { formDeletionCases } from "./form-deletion-cases";

let runtimePool: Pool;
let migrationPool: Pool;
let db: Database;
let authorization: AuthorizationService;
let forms: FormService;
let submissions: SubmissionService;
let members: MembershipService;

function testConnection(value: string | undefined): string {
  if (!value) throw new Error("Run setup before critical checks.");
  const target = new URL(value);
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.pathname !== "/rotapress_test"
  ) {
    throw new Error(
      "Forms checks require the disposable local rotapress_test database.",
    );
  }
  return value;
}

async function actor(label: string): Promise<TrustedActor> {
  // Service-only trusted actor fixture; browser journeys use real OTP sessions.
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

async function installedClub() {
  const owner = await actor("forms-owner");
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
    name: "Synthetic Forms Club",
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

const contactAnswers = {
  name: "Synthetic visitor",
  email: "visitor@example.test",
  message: "Synthetic private response",
};

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
  members = new MembershipService(db, authorization);
  submissions = new SubmissionService(db, authorization, members);
});

beforeEach(async () => {
  await migrationPool.query(
    'TRUNCATE club.installation, club.organization, club.membership, club.audit_entry, club."user" CASCADE',
  );
});
afterAll(async () => {
  await Promise.all([runtimePool?.end(), migrationPool?.end()]);
});

describe("C05 forms versions, private responses and durable notifications", () => {
  it("duplicates only scoped content and keeps response counts private to reviewers", async () => {
    const { owner, scope } = await installedClub();
    const published = await contact(owner);
    await forms.updateSettings(owner, published.id, {
      recipients: ["synthetic@example.test"],
      retentionDays: 30,
    });
    await submissions.submit(null, published.id, {
      versionId: published.versionId,
      requestId: randomUUID(),
      answers: contactAnswers,
    });
    const current = await forms.detail(owner, published.id);
    const copy = await forms.duplicate(owner, current.id, {
      expectedRevision: current.draftRevision,
    });
    expect(copy).toMatchObject({
      draft: { title: "Contact (copy)" },
      publishedVersionId: null,
      archived: false,
    });
    expect(copy.draft.fields).toEqual(current.draft.fields);
    expect(await forms.settings(owner, copy.id)).toEqual({
      recipients: [],
      retentionDays: null,
    });
    expect(
      (await forms.list(owner)).find((item) => item.id === current.id)
        ?.responses,
    ).toEqual({ total: 1, new: 1 });
    expect(
      (await forms.list(owner)).find((item) => item.id === copy.id)?.responses,
    ).toEqual({ total: 0, new: 0 });
    await expect(forms.publicForm(copy.id)).rejects.toMatchObject({
      code: "FORM_NOT_FOUND",
    });
    await expect(
      forms.duplicate(owner, current.id, { expectedRevision: 999 }),
    ).rejects.toMatchObject({ code: "FORM_REVISION_CONFLICT" });
    const editor = await actor("studio-editor");
    await db
      .insert(membership)
      .values({
        organizationId: scope.organizationId,
        userId: editor.userId,
        status: "approved",
        role: "editor",
      });
    expect(
      (await forms.list(editor)).every((item) => item.responses === undefined),
    ).toBe(true);
    const stranger = await actor("studio-stranger");
    await expect(
      forms.duplicate(stranger, current.id, {
        expectedRevision: current.draftRevision,
      }),
    ).rejects.toThrow();
    await expect(forms.list(stranger)).rejects.toThrow();
  });
  formDeletionCases(() => ({
    db,
    authorization,
    forms,
    submissions,
    actor,
    installedClub,
  }));
  it("isolates drafts, rejects unsafe fields and retains immutable scoped response definitions", async () => {
    const { owner } = await installedClub();
    let draft = await forms.create(owner, { kind: "contact" });
    await expect(forms.publicForm(draft.id)).rejects.toMatchObject({
      code: "FORM_NOT_FOUND",
    });
    const definition: FormDefinition = {
      ...draft.draft,
      fields: [
        {
          id: "choice",
          type: "choice",
          label: "Choose",
          description: "",
          required: true,
          options: ["yes", "no"],
          condition: null,
        },
        {
          id: "details",
          type: "textarea",
          label: "Original details",
          description: "",
          required: true,
          options: [],
          condition: { fieldId: "choice", equals: "yes" },
        },
        {
          id: "consent",
          type: "consent",
          label: "Synthetic consent wording version one",
          description: "",
          required: true,
          options: [],
          condition: null,
        },
      ],
    };
    expect(
      formDefinitionSchema.safeParse({
        ...definition,
        fields: [...definition.fields].reverse(),
      }).success,
    ).toBe(false);
    draft = await forms.save(owner, draft.id, {
      expectedRevision: draft.draftRevision,
      definition,
    });
    await expect(
      forms.save(owner, draft.id, { expectedRevision: 1, definition }),
    ).rejects.toMatchObject({ code: "FORM_REVISION_CONFLICT" });
    await forms.publish(owner, draft.id, {
      expectedRevision: draft.draftRevision,
    });
    const published = await forms.publicForm(draft.id);
    expect(published).not.toHaveProperty("recipients");
    expect(published).not.toHaveProperty("draft");
    const input = {
      versionId: published.versionId,
      requestId: randomUUID(),
      answers: { choice: "yes", details: "Synthetic answer", consent: true },
    };
    await expect(
      submissions.submit(null, draft.id, {
        ...input,
        organizationId: randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      submissions.submit(null, draft.id, {
        ...input,
        answers: { ...input.answers, role: "owner" },
      }),
    ).rejects.toMatchObject({ code: "FORM_ANSWERS_INVALID" });
    await expect(
      submissions.submit(null, draft.id, {
        ...input,
        answers: { choice: "no", details: "Hidden field", consent: true },
      }),
    ).rejects.toMatchObject({ code: "FORM_ANSWERS_INVALID" });
    await expect(
      submissions.submit(null, draft.id, {
        ...input,
        answers: { choice: "yes", consent: false },
      }),
    ).rejects.toMatchObject({ code: "FORM_ANSWERS_INVALID" });
    const receipt = await submissions.submit(null, draft.id, input);
    const changed = {
      ...definition,
      fields: definition.fields.map((field) => ({
        ...field,
        label: `Updated ${field.label}`,
      })),
    };
    draft = await forms.save(owner, draft.id, {
      expectedRevision: draft.draftRevision,
      definition: changed,
    });
    expect((await forms.publicForm(draft.id)).definition).toEqual(definition);
    await forms.publish(owner, draft.id, {
      expectedRevision: draft.draftRevision,
    });
    expect((await submissions.detail(owner, receipt.id)).definition).toEqual(
      definition,
    );
    await expect(
      submissions.submit(null, draft.id, { ...input, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: "FORM_VERSION_CHANGED" });
    expect((await submissions.submit(null, draft.id, input)).duplicate).toBe(
      true,
    );
    await expect(
      runtimePool.query(
        "UPDATE club.form_version SET number = number + 1 WHERE id = $1",
        [published.versionId],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const other = await contact(owner);
    await expect(
      runtimePool.query(
        "UPDATE club.form SET published_version_id = $1 WHERE id = $2",
        [other.versionId, draft.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await forms.archive(owner, draft.id, {
      expectedRevision: draft.draftRevision,
      archived: true,
    });
    await expect(forms.publicForm(draft.id)).rejects.toMatchObject({
      code: "FORM_NOT_FOUND",
    });
    const archived = await forms.detail(owner, draft.id);
    await expect(
      forms.save(owner, draft.id, {
        expectedRevision: archived.draftRevision,
        definition,
      }),
    ).rejects.toMatchObject({ code: "FORM_ARCHIVED" });
    await expect(
      forms.publish(owner, draft.id, {
        expectedRevision: archived.draftRevision,
      }),
    ).rejects.toMatchObject({ code: "FORM_ARCHIVED" });
  });

  it("serializes retry keys without blocking distinct responses and queues only configured recipients", async () => {
    const { owner } = await installedClub();
    const published = await contact(owner);
    await forms.updateSettings(owner, published.id, {
      recipients: ["reviewer@example.test"],
      retentionDays: null,
    });
    const input = {
      versionId: published.versionId,
      requestId: randomUUID(),
      answers: contactAnswers,
    };
    const receipts = await Promise.all([
      submissions.submit(null, published.id, input),
      submissions.submit(null, published.id, input),
    ]);
    expect(new Set(receipts.map((receipt) => receipt.id)).size).toBe(1);
    expect(receipts.map((receipt) => receipt.duplicate).sort()).toEqual([
      false,
      true,
    ]);
    await expect(
      submissions.submit(null, published.id, {
        ...input,
        answers: { ...contactAnswers, message: "Changed" },
      }),
    ).rejects.toMatchObject({ code: "SUBMISSION_REPLAY_CONFLICT" });
    await expect(
      submissions.submit(null, published.id, {
        ...input,
        requestId: randomUUID(),
        answers: { ...contactAnswers, email: "invalid" },
      }),
    ).rejects.toMatchObject({ code: "FORM_ANSWERS_INVALID" });
    await submissions.submit(null, published.id, {
      ...input,
      requestId: randomUUID(),
    });
    expect(await db.select().from(formSubmission)).toHaveLength(2);
    const jobs = await db.select().from(formNotification);
    expect(jobs).toHaveLength(2);
    expect(
      jobs.every(
        (job) =>
          job.recipient === "reviewer@example.test" && job.status === "pending",
      ),
    ).toBe(true);
  });

  it("creates only verified pending applications atomically and preserves suspension", async () => {
    const { owner, scope } = await installedClub();
    const applicant = await actor("applicant");
    const draft = await forms.create(owner, { kind: "membership" });
    await forms.publish(owner, draft.id, {
      expectedRevision: draft.draftRevision,
    });
    const published = await forms.publicForm(draft.id);
    const input = {
      versionId: published.versionId,
      requestId: randomUUID(),
      answers: {
        name: "Synthetic applicant",
        motivation: "Synthetic interest",
      },
    };
    await expect(
      submissions.submit(null, draft.id, input),
    ).rejects.toMatchObject({ code: "VERIFIED_IDENTITY_REQUIRED" });
    await expect(
      submissions.submit(
        { ...applicant, emailVerified: false },
        draft.id,
        input,
      ),
    ).rejects.toMatchObject({ code: "VERIFIED_IDENTITY_REQUIRED" });
    await expect(
      submissions.submit(applicant, draft.id, {
        ...input,
        answers: { name: "" },
      }),
    ).rejects.toMatchObject({ code: "FORM_ANSWERS_INVALID" });
    expect(await members.own(applicant)).toBeNull();
    await expect(members.apply(applicant)).rejects.toMatchObject({
      code: "FORM_REQUIRED",
    });
    const receipt = await submissions.submit(applicant, draft.id, input);
    expect(receipt.membershipStatus).toBe("pending");
    expect(await members.own(applicant)).toMatchObject({
      role: "member",
      status: "pending",
    });
    await expect(
      authorization.require(applicant, "admin.access"),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    const otherApplicant = await actor("other-applicant");
    await expect(
      submissions.submit(otherApplicant, draft.id, input),
    ).rejects.toMatchObject({ code: "SUBMISSION_REPLAY_CONFLICT" });
    expect(await members.own(otherApplicant)).toBeNull();
    await db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, applicant.userId));
    await expect(
      submissions.submit(applicant, draft.id, {
        ...input,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_SUSPENDED" });
    expect(await db.select().from(formSubmission)).toHaveLength(1);
    expect((await submissions.detail(owner, receipt.id)).applicant?.email).toBe(
      applicant.email,
    );
    expect(scope.organizationId).toBeTruthy();
  });

  it("denies editor answers/export/settings and requires deliberate previewed scoped deletion", async () => {
    const { owner, scope } = await installedClub();
    const editor = await actor("editor");
    await db.insert(membership).values({
      organizationId: scope.organizationId,
      userId: editor.userId,
      role: "editor",
      status: "approved",
    });
    const published = await contact(owner);
    const receipt = await submissions.submit(null, published.id, {
      versionId: published.versionId,
      requestId: randomUUID(),
      answers: { ...contactAnswers, name: "=SUM(1,2)", message: "@malicious" },
    });
    expect((await forms.detail(editor, published.id)).id).toBe(published.id);
    for (const attempt of [
      () => submissions.list(editor, published.id),
      () => submissions.detail(editor, receipt.id),
      () => submissions.exportCsv(editor, published.id),
      () => submissions.delete(editor, receipt.id, { confirm: true }),
      () => forms.settings(editor, published.id),
      () =>
        forms.updateSettings(editor, published.id, {
          recipients: [editor.email],
          retentionDays: 1,
        }),
    ])
      await expect(attempt()).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(submissions.detail(owner, randomUUID())).rejects.toMatchObject(
      { code: "SUBMISSION_NOT_FOUND" },
    );
    const csv = await submissions.exportCsv(owner, published.id);
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain('"\'@malicious"');
    expect(csvCell("\t=SUM(1,2)")).toBe('"\'\t=SUM(1,2)"');
    await submissions.updateStatus(owner, receipt.id, { status: "closed" });
    expect(
      (await submissions.list(owner, published.id, { status: "new" }))
        .submissions,
    ).toHaveLength(0);
    await expect(submissions.delete(owner, receipt.id, {})).rejects.toThrow();
    await expect(
      submissions.retentionPreview(owner, published.id),
    ).rejects.toMatchObject({ code: "RETENTION_NOT_CONFIGURED" });
    await forms.updateSettings(owner, published.id, {
      recipients: [],
      retentionDays: 1,
    });
    await db
      .update(formSubmission)
      .set({ createdAt: new Date(Date.now() - 3 * 86400000) })
      .where(eq(formSubmission.id, receipt.id));
    const preview = await submissions.retentionPreview(owner, published.id);
    expect(preview.count).toBe(1);
    await expect(
      submissions.deleteRetained(owner, published.id, {
        cutoff: new Date().toISOString(),
        previewToken: preview.previewToken,
        confirm: true,
      }),
    ).rejects.toMatchObject({ code: "RETENTION_PREVIEW_CHANGED" });
    expect(
      await submissions.deleteRetained(owner, published.id, {
        cutoff: preview.cutoff,
        previewToken: preview.previewToken,
        confirm: true,
      }),
    ).toEqual({ deleted: 1 });
    await expect(submissions.detail(owner, receipt.id)).rejects.toMatchObject({
      code: "SUBMISSION_NOT_FOUND",
    });
  });

  it("retains responses on SMTP failure and retries a bounded notification with a stable identity", async () => {
    const { owner } = await installedClub();
    const published = await contact(owner);
    await forms.updateSettings(owner, published.id, {
      recipients: ["reviewer@example.test"],
      retentionDays: null,
    });
    const receipt = await submissions.submit(null, published.id, {
      versionId: published.versionId,
      requestId: randomUUID(),
      answers: contactAnswers,
    });
    const failing = new FormNotificationRunner(
      db,
      {
        async sendSubmissionNotification() {
          throw new Error("Synthetic SMTP failure");
        },
      },
      "http://127.0.0.1:3000",
    );
    expect(await failing.runBatch()).toMatchObject({
      processed: 1,
      sent: 0,
      deferred: 1,
    });
    const detail = await submissions.detail(owner, receipt.id);
    expect(detail.answers).toEqual(contactAnswers);
    expect(detail.delivery[0]).toMatchObject({
      status: "pending",
      attempts: 1,
      lastErrorCode: "MAIL_DELIVERY_UNAVAILABLE",
    });
    await db
      .update(formNotification)
      .set({ status: "failed", attempts: 5 })
      .where(eq(formNotification.submissionId, receipt.id));
    await submissions.retryNotification(owner, receipt.id);
    const delivered: { to: string; link: string; messageId: string }[] = [];
    const succeeding = new FormNotificationRunner(
      db,
      {
        async sendSubmissionNotification(to, link, messageId) {
          delivered.push({ to, link, messageId });
        },
      },
      "http://127.0.0.1:3000",
    );
    expect(await succeeding.runBatch()).toMatchObject({
      processed: 1,
      sent: 1,
    });
    expect(await succeeding.runBatch()).toMatchObject({ processed: 0 });
    expect(delivered).toHaveLength(1);
    expect(delivered[0].link).toContain(
      `/admin/forms/${published.id}/submissions/${receipt.id}`,
    );
    expect(JSON.stringify(delivered)).not.toContain(contactAnswers.message);
    expect(delivered[0].messageId).toContain(detail.delivery[0].id);
    const next = await submissions.submit(null, published.id, {
      versionId: published.versionId,
      requestId: randomUUID(),
      answers: contactAnswers,
    });
    await forms.updateSettings(owner, published.id, {
      recipients: [],
      retentionDays: null,
    });
    expect((await succeeding.runBatch()).sent).toBe(0);
    expect(
      (await submissions.detail(owner, next.id)).delivery[0],
    ).toMatchObject({ status: "failed", lastErrorCode: "RECIPIENT_REMOVED" });
    await submissions.delete(owner, receipt.id, { confirm: true });
    expect(
      await db
        .select()
        .from(formNotification)
        .where(eq(formNotification.submissionId, receipt.id)),
    ).toHaveLength(0);
  });
});
