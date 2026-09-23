import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { emailTemplateOverride } from "../../db/schema/email";
import { form } from "../../db/schema/forms";
import { membership } from "../../db/schema/club";
import { ScopedEmailTemplateService } from "../../src/integrations/email/ScopedEmailTemplateService";
import { EmailTemplateReader } from "../../src/integrations/email/EmailTemplateReader";
import { emailTemplateCatalogue } from "../../src/integrations/email/email_templates";
import { FormService } from "../../src/features/forms/FormService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import type { Context } from "./luma-sync-fixture";
import { calendarFixture, calendarDefinition } from "./calendar-cases";
import { emailServices } from "./email-cases";

export function emailScopeChecks(get: () => Context) {
  it("C13 email scopes: calendar overrides publish independently, inherit shared updates and leave other calendars unchanged", async () => {
    const f = await calendarFixture(get);
    const s = emailServices(f);
    const scoped = new ScopedEmailTemplateService(f.db, f.authorization);
    const reader = new EmailTemplateReader(f.db);
    const second = await f.service.calendar(f.owner, {
      operation: "save",
      expectedVersion: 0,
      definition: { ...calendarDefinition, name: "Second synthetic calendar" },
    });
    const target = { kind: "calendar", id: f.id } as const;
    const other = { kind: "calendar", id: second.id } as const;
    const shared = {
      ...emailTemplateCatalogue.calendar_update.defaults,
      subject: "Shared calendar update",
    };
    await s.settings.saveTemplate(f.owner, {
      key: "calendar_update",
      expectedVersion: 0,
      draft: shared,
    });
    await s.settings.publishTemplate(f.owner, {
      key: "calendar_update",
      expectedVersion: 1,
    });
    expect(
      (await scoped.workspace(f.owner, target)).templates[0],
    ).toMatchObject({
      version: 0,
      published: null,
      draft: shared,
      fallback: shared,
    });
    const draft = { ...shared, subject: "First calendar update only" };
    await scoped.change(f.owner, {
      target,
      operation: "save",
      key: "calendar_update",
      expectedVersion: 0,
      draft,
    });
    expect(
      (await reader.resolve(f.scope.organizationId, "calendar_update", target))
        .subject,
    ).toBe(shared.subject);
    await scoped.change(f.owner, {
      target,
      operation: "publish",
      key: "calendar_update",
      expectedVersion: 1,
    });
    expect(
      (await reader.resolve(f.scope.organizationId, "calendar_update", target))
        .subject,
    ).toBe(draft.subject);
    expect(
      (await reader.resolve(f.scope.organizationId, "calendar_update", other))
        .subject,
    ).toBe(shared.subject);
    await s.settings.saveTemplate(f.owner, {
      key: "calendar_update",
      expectedVersion: 2,
      draft: { ...shared, subject: "Updated shared template" },
    });
    await s.settings.publishTemplate(f.owner, {
      key: "calendar_update",
      expectedVersion: 3,
    });
    expect(
      (await reader.resolve(f.scope.organizationId, "calendar_update", target))
        .subject,
    ).toBe(draft.subject);
    expect(
      (await reader.resolve(f.scope.organizationId, "calendar_update", other))
        .subject,
    ).toBe("Updated shared template");
    await scoped.change(f.owner, {
      target,
      operation: "useDefault",
      key: "calendar_update",
      expectedVersion: 2,
    });
    expect(
      (await reader.resolve(f.scope.organizationId, "calendar_update", target))
        .subject,
    ).toBe("Updated shared template");
    expect(
      (await scoped.workspace(f.owner, target)).templates[0].draft.subject,
    ).toBe(draft.subject);
    await expect(
      scoped.change(f.owner, {
        target,
        operation: "save",
        key: "calendar_update",
        expectedVersion: 2,
        draft,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_SETTINGS_CHANGED" });
    await expect(
      scoped.change(f.owner, {
        target,
        operation: "save",
        key: "verification",
        expectedVersion: 0,
        draft,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_TEMPLATE_SCOPE" });
    await expect(scoped.workspace(f.manager, target)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(
      f.db
        .insert(emailTemplateOverride)
        .values({
          organizationId: randomUUID(),
          calendarId: second.id,
          key: "calendar_update",
          draft,
        }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("C13 email scopes: form-specific mail uses its published template and deletion removes only that form's overrides", async () => {
    const c = get();
    const { owner, manager, scope } = await c.club();
    const s = emailServices(c);
    const forms = new FormService(c.db, c.authorization);
    const scoped = new ScopedEmailTemplateService(c.db, c.authorization);
    const first = await forms.create(owner, {
      kind: "contact",
      title: "First synthetic enquiry",
    });
    const second = await forms.create(owner, {
      kind: "contact",
      title: "Second synthetic enquiry",
    });
    const target = { kind: "form", id: first.id } as const;
    const draft = {
      ...emailTemplateCatalogue.form_submission.defaults,
      subject: "First form alert",
      heading: "A response for the first form",
    };
    await expect(scoped.workspace(manager, target)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await scoped.change(owner, {
      target,
      operation: "save",
      key: "form_submission",
      expectedVersion: 0,
      draft,
    });
    await s.mailer.sendSubmissionNotification(
      owner.email,
      origin + "/admin/inbox",
      `<${randomUUID()}@example.test>`,
      first.id,
    );
    expect(s.send.mock.calls.at(-1)?.[1].subject).toBe(
      emailTemplateCatalogue.form_submission.defaults.subject,
    );
    await scoped.change(owner, {
      target,
      operation: "publish",
      key: "form_submission",
      expectedVersion: 1,
    });
    await s.mailer.sendSubmissionNotification(
      owner.email,
      origin + "/admin/inbox",
      `<${randomUUID()}@example.test>`,
      first.id,
    );
    expect(s.send.mock.calls.at(-1)?.[1].subject).toBe(draft.subject);
    await s.mailer.sendSubmissionNotification(
      owner.email,
      origin + "/admin/inbox",
      `<${randomUUID()}@example.test>`,
      second.id,
    );
    expect(s.send.mock.calls.at(-1)?.[1].subject).toBe(
      emailTemplateCatalogue.form_submission.defaults.subject,
    );
    await c.db
      .update(form)
      .set({ archived: true })
      .where(eq(form.id, first.id));
    await expect(
      scoped.change(owner, {
        target,
        operation: "publish",
        key: "form_submission",
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_SOURCE_ARCHIVED" });
    await c.db
      .delete(form)
      .where(
        and(
          eq(form.id, first.id),
          eq(form.organizationId, scope.organizationId),
        ),
      );
    expect(
      await c.db
        .select()
        .from(emailTemplateOverride)
        .where(eq(emailTemplateOverride.formId, first.id)),
    ).toHaveLength(0);
    expect(
      (await scoped.workspace(owner, { kind: "form", id: second.id }))
        .templates[0].published,
    ).toBeNull();
  });

  it("C13 email scopes: event managers can edit only their event form emails and revocation stops subsequent edits", async () => {
    const c = get();
    const { owner, manager } = await c.club();
    const scoped = new ScopedEmailTemplateService(c.db, c.authorization);
    const forms = new FormService(c.db, c.authorization);
    const modules = new EventModuleService(c.db, c.events);
    async function eventForm(name: string, managerUserId: string) {
      let event = await c.events.create(owner, {
        title: name,
        description: "Synthetic email scope",
        startsAt: "2030-06-12T14:00:00Z",
        endsAt: null,
        timezone: "Europe/Luxembourg",
        venue: "Synthetic venue",
        visibility: "public",
        managerUserId,
      });
      for (const key of ["website", "forms"] as const)
        event = await modules.change(owner, {
          id: event.id,
          expectedVersion: event.version,
          key,
          operation: "enable",
          confirmed: true,
        });
      return forms.createEventForm(owner, event.id, {
        kind: "event",
        title: name + " enquiry",
      });
    }
    const own = await eventForm("Managed event", manager.userId);
    const other = await eventForm("Other event", owner.userId);
    const target = { kind: "form", id: own.id } as const;
    const draft = {
      ...emailTemplateCatalogue.form_submission.defaults,
      subject: "Managed event form",
    };
    await scoped.change(manager, {
      target,
      operation: "save",
      key: "form_submission",
      expectedVersion: 0,
      draft,
    });
    await scoped.change(manager, {
      target,
      operation: "publish",
      key: "form_submission",
      expectedVersion: 1,
    });
    await expect(
      scoped.workspace(manager, { kind: "form", id: other.id }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    await expect(
      scoped.change(manager, {
        target: { kind: "form", id: other.id },
        operation: "save",
        key: "form_submission",
        expectedVersion: 0,
        draft,
      }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    await c.db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, manager.userId));
    await expect(
      scoped.change(manager, {
        target,
        operation: "save",
        key: "form_submission",
        expectedVersion: 2,
        draft,
      }),
    ).rejects.toThrow();
  });
}
const origin = "http://127.0.0.1:4100";
