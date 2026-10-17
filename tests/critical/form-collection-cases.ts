import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { clubEvent } from "../../db/schema/events";
import { form } from "../../db/schema/forms";
import type { TrustedActor } from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import type { FormService } from "../../src/features/forms/FormService";
import { starterDefinition } from "../../src/features/forms/form_schemas";

export function formCollectionCases(
  context: () => {
    db: Database;
    forms: FormService;
    actor: (label: string) => Promise<TrustedActor>;
    installedClub: () => Promise<{
      owner: TrustedActor;
      scope: { organizationId: string };
    }>;
  },
) {
  it("finds website forms beyond the former cap with exact scoped totals and response permissions", async () => {
    const { db, forms, actor, installedClub } = context();
    const { owner, scope } = await installedClub();
    const template = starterDefinition("contact");
    const rows = Array.from({ length: 205 }, (_, index) => ({
      organizationId: scope.organizationId,
      kind: "contact" as const,
      draft: {
        ...template,
        title: `Synthetic form ${String(index).padStart(3, "0")}`,
      },
      archived: index === 204,
    }));
    await db.insert(form).values(rows);
    const eventId = randomUUID();
    await db
      .insert(clubEvent)
      .values({
        id: eventId,
        organizationId: scope.organizationId,
        title: "Scoped event",
        startsAt: new Date(),
        timezone: "Europe/Luxembourg",
        createdBy: owner.userId,
      });
    await db
      .insert(form)
      .values({
        organizationId: scope.organizationId,
        eventId,
        kind: "event",
        draft: template,
      });
    const first = await forms.collection.list(owner, {
      pageSize: 100,
      sort: "name",
    });
    const third = await forms.collection.list(owner, {
      pageSize: 100,
      sort: "name",
      page: 3,
    });
    expect(first).toMatchObject({
      total: 205,
      counts: { all: 205, active: 204, archived: 1, changes: 204 },
    });
    expect(third.forms).toHaveLength(5);
    expect(
      third.forms.some((item) =>
        first.forms.some((prior) => prior.id === item.id),
      ),
    ).toBe(false);
    expect(
      (
        await forms.collection.list(owner, {
          search: "Synthetic form 204",
          status: "archived",
        })
      ).forms,
    ).toHaveLength(1);
    expect((await forms.collection.list(owner, { search: "%" })).total).toBe(0);
    const editor = await actor("collection-editor");
    await db
      .insert(membership)
      .values({
        organizationId: scope.organizationId,
        userId: editor.userId,
        role: "editor",
        status: "approved",
      });
    const edited = await forms.collection.list(editor, {});
    expect(edited.forms.every((item) => item.responses === undefined)).toBe(
      true,
    );
    await expect(
      forms.collection.list(editor, { sort: "responses" }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      forms.collection.list(await actor("collection-outsider"), {}),
    ).rejects.toThrow();
  });
}
