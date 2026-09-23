import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { clubEvent } from "../../db/schema/events";
import {
  form,
  formVersion,
  formSubmission,
  formNotification,
} from "../../db/schema/forms";
import {
  formWebhook,
  formWebhookDelivery,
} from "../../db/schema/form-webhooks";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import type { FormService, SubmissionService } from "../../src/features/forms";
import { FormDeletionService } from "../../src/features/forms/FormDeletionService";
import { starterDefinition } from "../../src/features/forms/form_schemas";

export function formDeletionCases(
  context: () => {
    db: Database;
    authorization: AuthorizationService;
    forms: FormService;
    submissions: SubmissionService;
    actor: (label: string) => Promise<TrustedActor>;
    installedClub: () => Promise<{
      owner: TrustedActor;
      scope: { organizationId: string };
    }>;
  },
) {
  it("permanently deletes only a reviewed archived form and its owned history", async () => {
    const { db, authorization, forms, submissions, installedClub } = context();
    const { owner, scope } = await installedClub();
    const deletion = new FormDeletionService(db, authorization);
    const draft = await forms.create(owner, { kind: "contact" });
    const other = await forms.create(owner, { kind: "contact" });
    await forms.publish(owner, draft.id, {
      expectedRevision: draft.draftRevision,
    });
    const published = await forms.publicForm(draft.id);
    await forms.updateSettings(owner, draft.id, {
      recipients: ["reviewer@example.test"],
      retentionDays: null,
    });
    await db.insert(formWebhook).values({
      formId: draft.id,
      organizationId: scope.organizationId,
      enabled: true,
      endpoint: "https://example.test/form",
      secret: randomBytes(32).toString("hex"),
    });
    await submissions.submit(null, draft.id, {
      versionId: published.versionId,
      requestId: randomUUID(),
      answers: {
        name: "Synthetic visitor",
        email: "visitor@example.test",
        message: "Synthetic private response",
      },
    });
    const confirm = {
      expectedRevision: draft.draftRevision,
      expectedResponses: 1,
      confirmed: true,
    };
    await expect(
      deletion.delete(owner, draft.id, confirm),
    ).rejects.toMatchObject({ code: "FORM_DELETE_BLOCKED" });
    await forms.archive(owner, draft.id, {
      expectedRevision: draft.draftRevision,
      archived: true,
    });
    const review = await deletion.review(owner, draft.id);
    expect(review).toMatchObject({
      responses: 1,
      versions: 1,
      blockedReason: null,
    });
    const input = { ...confirm, expectedRevision: review.revision };
    await expect(
      deletion.delete(owner, draft.id, { ...input, confirmed: false }),
    ).rejects.toThrow();
    await expect(
      deletion.delete(owner, draft.id, confirm),
    ).rejects.toMatchObject({ code: "FORM_DELETE_CHANGED" });
    await expect(
      deletion.delete(owner, draft.id, { ...input, expectedResponses: 0 }),
    ).rejects.toMatchObject({ code: "FORM_DELETE_CHANGED" });
    expect(await db.select().from(formNotification)).toHaveLength(1);
    expect(await db.select().from(formWebhookDelivery)).toHaveLength(1);
    // Immutable versions cannot be directly erased by the restricted runtime role.
    await expect(
      db.delete(formVersion).where(eq(formVersion.formId, draft.id)),
    ).rejects.toThrow();
    await deletion.delete(owner, draft.id, input);
    for (const table of [
      formSubmission,
      formVersion,
      formNotification,
      formWebhook,
      formWebhookDelivery,
    ]) {
      expect(
        await db
          .select({ id: table.id })
          .from(table)
          .where(eq(table.formId, draft.id)),
      ).toHaveLength(0);
    }
    expect((await forms.detail(owner, other.id)).id).toBe(other.id);
    await expect(forms.detail(owner, draft.id)).rejects.toMatchObject({
      code: "FORM_NOT_FOUND",
    });
    await expect(forms.publicForm(draft.id)).rejects.toMatchObject({
      code: "FORM_NOT_FOUND",
    });
  });

  it("protects archived form history from editors, members, restored previews and booking deletion", async () => {
    const { db, authorization, forms, actor, installedClub } = context();
    const { owner, scope } = await installedClub();
    const deletion = new FormDeletionService(db, authorization);
    const draft = await forms.create(owner, { kind: "contact" });
    const archived = await forms.archive(owner, draft.id, {
      expectedRevision: draft.draftRevision,
      archived: true,
    });
    const input = {
      expectedRevision: archived.draftRevision,
      expectedResponses: 0,
      confirmed: true,
    };
    for (const role of ["editor", "member"] as const) {
      const person = await actor(role);
      await db
        .insert(membership)
        .values({
          organizationId: scope.organizationId,
          userId: person.userId,
          role,
          status: "approved",
        });
      await expect(deletion.review(person, draft.id)).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      await expect(
        deletion.delete(person, draft.id, input),
      ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    }
    await forms.archive(owner, draft.id, {
      expectedRevision: archived.draftRevision,
      archived: false,
    });
    await expect(deletion.delete(owner, draft.id, input)).rejects.toMatchObject(
      { code: "FORM_DELETE_BLOCKED" },
    );
    const [event] = await db
      .insert(clubEvent)
      .values({
        organizationId: scope.organizationId,
        title: "Synthetic booking history",
        startsAt: new Date("2027-01-01T10:00:00Z"),
        timezone: "Europe/Paris",
        createdBy: owner.userId,
      })
      .returning();
    const [registration] = await db
      .insert(form)
      .values({
        organizationId: scope.organizationId,
        eventId: event.id,
        kind: "registration",
        archived: true,
        draft: starterDefinition("registration", "Synthetic booking form"),
      })
      .returning();
    expect(
      (await deletion.review(owner, registration.id)).blockedReason,
    ).toContain("booking history");
    await expect(
      deletion.delete(owner, registration.id, {
        ...input,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "FORM_DELETE_BLOCKED" });
    expect((await forms.detail(owner, registration.id)).id).toBe(
      registration.id,
    );
  });
}
