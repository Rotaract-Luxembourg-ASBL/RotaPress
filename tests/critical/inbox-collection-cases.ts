import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { form, formSubmission } from "../../db/schema/forms";
import type { TrustedActor } from "../../src/core/authorization/AuthorizationService";
import type { InboxService } from "../../src/features/forms/InboxService";
import type { Database } from "../../src/infrastructure/database/client";

type Context = {
  db: Database;
  inbox: InboxService;
  club: () => Promise<{
    owner: TrustedActor;
    scope: { organizationId: string };
  }>;
  contact: (owner: TrustedActor) => Promise<{ id: string; versionId: string }>;
};

/** Uses the inbox suite's isolated PostgreSQL fixture and existing auth setup. */
export function registerInboxCollectionCases(context: () => Context) {
  it("finds response sources beyond 1000 without returning full drafts", async () => {
    const { db, inbox, club, contact } = context();
    const { owner, scope } = await club();
    const published = await contact(owner);
    const [original] = await db
      .select()
      .from(form)
      .where(eq(form.id, published.id));
    const sources = Array.from({ length: 1005 }, (_, index) => ({
      id: randomUUID(),
      organizationId: scope.organizationId,
      kind: "contact" as const,
      archived: index === 1004,
      draft: {
        ...(original.draft as Record<string, unknown>),
        title: `Source collection ${String(index).padStart(4, "0")}`,
      },
    }));
    await db.insert(form).values(sources);
    const last = await inbox.forms(owner, {
      q: "Source collection",
      page: 11,
      pageSize: 100,
    });
    expect(last).toMatchObject({ total: 1005, page: 11, pageSize: 100 });
    expect(last.forms.map((item) => item.id)).toEqual(
      sources.slice(1000).map((item) => item.id),
    );
    expect(last.forms.at(-1)).toMatchObject({ archived: true });
    expect(last.forms[0]).not.toHaveProperty("draft");
    expect(await inbox.forms(owner, { id: sources[1004].id })).toMatchObject({
      total: 1,
      forms: [{ id: sources[1004].id, title: "Source collection 1004" }],
    });
    expect(
      (await inbox.forms(owner, { q: "Source collection 1004" })).total,
    ).toBe(1);
    expect((await inbox.forms(owner, { q: "%" })).total).toBe(0);
    expect(
      (
        await inbox.forms(owner, {
          q: "Source collection",
          page: 100000,
          pageSize: 100,
        })
      ).page,
    ).toBe(11);
    await expect(inbox.forms(owner, { pageSize: 101 })).rejects.toThrow();
    await expect(
      inbox.forms(owner, { organizationId: randomUUID() }),
    ).rejects.toThrow();
  });

  it("keeps exact response totals and deterministic page boundaries", async () => {
    const { db, inbox, club, contact } = context();
    const { owner, scope } = await club();
    const published = await contact(owner);
    const rows = Array.from({ length: 205 }, (_, index) => ({
      id: randomUUID(),
      organizationId: scope.organizationId,
      formId: published.id,
      versionId: published.versionId,
      requestId: randomUUID(),
      payloadHash: "synthetic-collection-fixture",
      status: index < 103 ? ("new" as const) : ("closed" as const),
      answers: {
        name: "Synthetic collection",
        email: "collection@example.test",
        message: `Collection response ${index}`,
      },
      createdAt: new Date("2026-10-15T12:00:00Z"),
    }));
    await db.insert(formSubmission).values(rows);
    const pages = await Promise.all(
      [0, 1, 2].map((page) =>
        inbox.list(owner, { formId: published.id, page }),
      ),
    );
    expect(pages.map((page) => page.messages.length)).toEqual([100, 100, 5]);
    expect(pages.map((page) => page.hasMore)).toEqual([true, true, false]);
    for (const page of pages) {
      expect(page).toMatchObject({
        total: 205,
        counts: { new: 103, reviewing: 0, closed: 102 },
      });
      expect(page).not.toHaveProperty("forms");
    }
    expect(
      new Set(
        pages.flatMap((page) => page.messages.map((message) => message.id)),
      ).size,
    ).toBe(205);
    expect(
      await inbox.list(owner, {
        formId: published.id,
        status: "closed",
        page: 1,
      }),
    ).toMatchObject({
      total: 102,
      hasMore: false,
      counts: { new: 0, reviewing: 0, closed: 102 },
    });
  });
}
