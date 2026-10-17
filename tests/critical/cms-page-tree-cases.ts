import { expect, it } from "vitest";
import type { Database } from "../../src/infrastructure/database/client";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms/CmsService";
import { CmsPageTreeService } from "../../src/features/cms/CmsPageTreeService";
import type { PageRow } from "../../src/features/cms/cms_workspace_schemas";

export function pageTreeChecks(
  get: () => {
    db: Database;
    cms: CmsService;
    authorization: AuthorizationService;
    installedClub: () => Promise<{ owner: TrustedActor }>;
  },
) {
  it("reorders paginated siblings and reparents pages atomically without changing URLs", async () => {
    const { db, cms, authorization, installedClub } = get();
    const { owner } = await installedClub();
    const tree = new CmsPageTreeService(db, authorization, cms);
    const pages = [];
    for (const title of [
      "Tree first",
      "Tree second",
      "Tree third",
      "Tree child",
    ])
      pages.push(
        await cms.create(owner, { kind: "page", locale: "en", title }),
      );
    const query = { collection: "all", parentId: "root", sort: "order" };
    const rows = () => cms.workspace.list(owner, query);
    const current = async (id: string) =>
      (await cms.workspace.list(owner, { collection: "all", id })).items[0];
    const move = (page: PageRow, parentId: string | null, before?: PageRow) =>
      tree.move(owner, {
        id: page.id,
        locale: page.locale,
        expectedRevisionId: page.draftRevisionId,
        expectedPlacementVersion: page.placementVersion,
        parentId,
        beforeId: before?.id ?? null,
        expectedBeforeVersion: before?.placementVersion,
      });
    const original = (await rows()).items;
    const last = original.at(-1)!;
    await move(last, null, original[0]);
    const reordered = await rows();
    expect(reordered.items.map((page) => page.id)).toEqual([
      last.id,
      ...original.slice(0, -1).map((page) => page.id),
    ]);
    expect(reordered.items.map((page) => page.position)).toEqual([0, 1, 2, 3]);
    const parent = reordered.items[0];
    const child = reordered.items[2];
    await move(child, parent.id);
    const children = await cms.workspace.list(owner, {
      ...query,
      parentId: parent.id,
      pageSize: 1,
    });
    expect(children.total).toBe(1);
    expect(children.items[0]).toMatchObject({
      id: child.id,
      parentId: parent.id,
      slug: child.slug,
    });
    expect((await current(parent.id)).childCount).toBe(1);
    const first = await cms.workspace.list(owner, { ...query, pageSize: 1 });
    const second = await cms.workspace.list(owner, {
      ...query,
      pageSize: 1,
      page: 2,
    });
    expect(first.total).toBe(3);
    expect(first.items[0].id).not.toBe(second.items[0].id);
    await expect(
      move(await current(parent.id), child.id),
    ).rejects.toMatchObject({ code: "PAGE_HIERARCHY_CYCLE" });
    expect((await current(parent.id)).draftRevisionId).toBe(
      parent.draftRevisionId,
    );
    const beforeFailure = await rows();
    await expect(
      move(beforeFailure.items[1], null, {
        ...beforeFailure.items[0],
        placementVersion: 999,
      }),
    ).rejects.toMatchObject({ code: "PAGE_ORDER_CHANGED" });
    expect(await rows()).toEqual(beforeFailure);
    const moving = await current(child.id);
    const outcomes = await Promise.allSettled([
      move(moving, null),
      move(moving, null),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((result) => result.status === "rejected"),
    ).toMatchObject([{ reason: { code: "REVISION_CONFLICT" } }]);
    for (const page of pages)
      expect((await cms.detail(owner, page.id, "en")).draft.slug).toBe(
        page.draft.slug,
      );
  });

  it("keeps translated children reachable when their parent has no current-language variant", async () => {
    const { db, cms, authorization, installedClub } = get();
    const { owner } = await installedClub();
    const parent = await cms.create(owner, {
      kind: "page",
      locale: "fr",
      title: "Parent francais",
    });
    const child = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "English child",
    });
    await new CmsPageTreeService(db, authorization, cms).move(owner, {
      id: child.id,
      locale: "en",
      expectedRevisionId: child.draft.id,
      expectedPlacementVersion: 0,
      parentId: parent.id,
      beforeId: null,
    });
    const root = await cms.workspace.list(owner, {
      collection: "all",
      parentId: "root",
      locale: "en",
    });
    expect(root.items.map((page) => page.id)).toEqual([child.id]);
    expect(root.total).toBe(1);
  });
}
