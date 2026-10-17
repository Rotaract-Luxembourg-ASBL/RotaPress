import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { cmsRevision } from "../../db/schema/cms";
import sharp from "sharp";
import { AlbumService } from "../../src/features/media/AlbumService";
import { membership } from "../../db/schema/club";
import type { Database } from "../../src/infrastructure/database/client";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms/CmsService";
import type { MediaService } from "../../src/features/media/MediaService";
import { CmsPreviewService } from "../../src/features/cms/CmsPreviewService";
import { EventService } from "../../src/features/events/EventService";
import type { CmsData, CmsDetail } from "../../src/features/cms/cms_schemas";
import { pageTreeChecks } from "./cms-page-tree-cases";

const command = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});
const input = (
  page: CmsDetail,
  title = page.draft.title,
  data: CmsData = page.draft.data,
) => ({
  ...command(page),
  title,
  slug: page.draft.slug,
  description: page.draft.description,
  socialImageId: page.draft.socialImageId,
  data,
});
const selected = (page: CmsDetail) => ({
  ...command(page),
  archived: page.archived,
});
const richText = (text: string): CmsData => ({
  root: { props: {} },
  content: [{ type: "RichText", props: { id: "copy", version: 1, text } }],
});

export function workspaceChecks(
  get: () => {
    db: Database;
    cms: CmsService;
    media: MediaService;
    authorization: AuthorizationService;
    actor: (name: string) => Promise<TrustedActor>;
    installedClub: () => Promise<{
      owner: TrustedActor;
      scope: { organizationId: string };
    }>;
  },
) {
  pageTreeChecks(get);
  it("revision history discovers every retained version beyond 100 without exposing authors or other pages", async () => {
    const { cms, db, installedClub, actor } = get();
    const { owner } = await installedClub();
    const page = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Long history",
    });
    const [original] = await db
      .select()
      .from(cmsRevision)
      .where(eq(cmsRevision.id, page.draft.id));
    await db.insert(cmsRevision).values(
      Array.from({ length: 105 }, (_, index) => ({
        variantId: original.variantId,
        title: `History ${index}`,
        slug: original.slug,
        data: original.data,
        createdBy: owner.userId,
        createdAt: original.createdAt,
      })),
    );
    const first = await cms.revisionHistory(owner, {
      id: page.id,
      locale: "en",
      pageSize: 100,
    });
    const second = await cms.revisionHistory(owner, {
      id: page.id,
      locale: "en",
      pageSize: 100,
      page: 2,
    });
    expect(first.total).toBe(106);
    expect(first.revisions).toHaveLength(100);
    expect(second.revisions).toHaveLength(6);
    const ids = [...first.revisions, ...second.revisions].map((row) => row.id);
    expect(new Set(ids).size).toBe(106);
    expect(first.revisions[0]).not.toHaveProperty("createdBy");
    const repeated = await cms.revisionHistory(owner, {
      id: page.id,
      locale: "en",
      pageSize: 100,
    });
    expect(repeated).toEqual(first);
    expect(
      (
        await cms.revisionHistory(owner, {
          id: page.id,
          locale: "en",
          pageSize: 100,
          page: 999,
        })
      ).page,
    ).toBe(2);
    const other = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Separate history",
    });
    expect(
      (await cms.revisionHistory(owner, { id: other.id, locale: "en" })).total,
    ).toBe(1);
    await expect(
      cms.revisionHistory(await actor("history-outsider"), {
        id: page.id,
        locale: "en",
      }),
    ).rejects.toBeDefined();
  });
  it("linked galleries track published album changes while independent copies and immutable revisions stay stable", async () => {
    const { cms, db, media, authorization, installedClub } = get();
    const { owner } = await installedClub();
    const image = await media.uploadFromAdministration(owner, {
      filename: "album.jpg",
      bytes: await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#267a7a" },
      })
        .jpeg()
        .toBuffer(),
    });
    const albums = new AlbumService(db, authorization, media);
    let album = await albums.create(owner, {
      title: "Club album",
      items: [
        { assetId: image.id, alt: "Club photograph", caption: "First caption" },
      ],
    });
    let page = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Album page",
    });
    page = await cms.save(
      owner,
      input(page, page.draft.title, {
        root: { props: {} },
        content: [
          {
            type: "Gallery",
            props: { id: "linked", version: 1, albumId: album.id, items: [] },
          },
          {
            type: "Gallery",
            props: { id: "copy", version: 1, items: album.draft.items },
          },
        ],
      }),
    );
    await expect(cms.publish(owner, command(page))).rejects.toMatchObject({
      code: "ALBUM_NOT_PUBLISHED",
    });
    album = await albums.publish(owner, album.id, {
      expectedVersion: album.version,
    });
    await cms.publish(owner, command(page));
    await expect(
      albums.unpublish(owner, album.id, { expectedVersion: album.version }),
    ).rejects.toMatchObject({ code: "ALBUM_PUBLISHED_USE" });
    album = await albums.save(owner, album.id, {
      expectedVersion: album.version,
      data: {
        ...album.draft,
        items: [{ ...album.draft.items[0], caption: "Updated caption" }],
        layout: "masonry",
      },
    });
    let publicPage = await cms.publicPage("en", page.draft.slug);
    expect(publicPage?.data.content[0].props).toMatchObject({
      items: [{ caption: "First caption" }],
    });
    await albums.publish(owner, album.id, { expectedVersion: album.version });
    publicPage = await cms.publicPage("en", page.draft.slug);
    expect(publicPage?.data.content[0].props).toMatchObject({
      layout: "masonry",
      items: [{ caption: "Updated caption" }],
    });
    expect(publicPage?.data.content[1].props).toMatchObject({
      items: [{ caption: "First caption" }],
    });
    expect((await cms.detail(owner, page.id, "en")).draft.id).toBe(
      page.draft.id,
    );
  });
  it("pages paginate, retain independent URLs, reject hierarchy cycles and roll back conflicting bulk publication", async () => {
    const { cms, installedClub } = get();
    const { owner } = await installedClub();
    const parent = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Community plans",
    });
    let child = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Community plans",
    });
    expect(parent.draft.slug).toBe("community-plans");
    expect(child.draft.slug).toBe("community-plans-2");
    const first = await cms.workspace.list(owner, {
      collection: "all",
      pageSize: 1,
      sort: "title",
    });
    const second = await cms.workspace.list(owner, {
      collection: "all",
      pageSize: 1,
      sort: "title",
      page: 2,
    });
    expect(first.total).toBe(2);
    expect(first.items[0].id).not.toBe(second.items[0].id);
    child = await cms.workspace.quickEdit(owner, {
      ...command(child),
      expectedPlacementVersion: 0,
      title: child.draft.title,
      slug: child.draft.slug,
      parentId: parent.id,
      position: 10,
    });
    expect(child.draft.slug).toBe("community-plans-2");
    await expect(
      cms.workspace.quickEdit(owner, {
        ...command(parent),
        expectedPlacementVersion: 0,
        title: parent.draft.title,
        slug: parent.draft.slug,
        parentId: child.id,
        position: 0,
      }),
    ).rejects.toMatchObject({ code: "PAGE_HIERARCHY_CYCLE" });
    await cms.workspace.batch(owner, {
      action: "publish",
      items: [selected(parent), selected(child)],
    });
    const changed = await cms.save(owner, input(parent, "Changed parent"));
    const duplicate = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Conflicting draft",
      slug: child.draft.slug,
    });
    await expect(
      cms.workspace.batch(owner, {
        action: "publish",
        items: [selected(changed), selected(duplicate)],
      }),
    ).rejects.toMatchObject({ code: "SLUG_IN_USE" });
    expect((await cms.publicPage("en", parent.draft.slug))?.title).toBe(
      parent.draft.title,
    );
    await cms.workspace.batch(owner, {
      action: "archive",
      items: [selected(changed)],
    });
    expect(
      (await cms.workspace.list(owner, { collection: "all" })).items.find(
        (page) => page.id === child.id,
      )?.parentId,
    ).toBeNull();
    const archived = await cms.detail(owner, parent.id, "en");
    await cms.workspace.batch(owner, {
      action: "restore-archived",
      items: [selected(archived)],
    });
    const restored = await cms.detail(owner, parent.id, "en");
    expect(restored.archived).toBe(false);
    expect(restored.publishedRevisionId).toBeNull();
    expect(await cms.publicPage("en", restored.draft.slug)).toBeNull();
    child = await cms.workspace.quickEdit(owner, {
      ...command(child),
      expectedPlacementVersion: 2,
      title: child.draft.title,
      slug: child.draft.slug,
      parentId: restored.id,
      position: 10,
    });
    expect(
      (await cms.workspace.list(owner, { collection: "all" })).items.find(
        (row) => row.id === child.id,
      )?.parentTitle,
    ).toBe(restored.draft.title);
    await cms.archive(owner, command(restored));
    expect(
      (await cms.workspace.list(owner, { collection: "all" })).items.find(
        (row) => row.id === child.id,
      )?.parentId,
    ).toBeNull();
  });

  it("recovery copies are actor-private, keep the original base and reject concurrent overwrites and stale discards", async () => {
    const { db, cms, actor, installedClub } = get();
    const { owner, scope } = await installedClub();
    const editor = await actor("recovery-editor");
    await db.insert(membership).values({
      organizationId: scope.organizationId,
      userId: editor.userId,
      role: "editor",
      status: "approved",
    });
    const page = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Recovery example",
    });
    const recovery = await cms.checkpoints.save(owner, {
      ...input(page, "Unsaved owner input", richText("Private recovery")),
      expectedCheckpointVersion: 0,
    });
    expect(recovery.checkpoint?.version).toBe(1);
    expect(
      (await cms.checkpoints.read(editor, { id: page.id, locale: "en" }))
        .checkpoint,
    ).toBeNull();
    expect((await cms.detail(owner, page.id, "en")).draft.title).toBe(
      "Recovery example",
    );
    await expect(
      cms.checkpoints.save(owner, {
        ...input(page),
        expectedCheckpointVersion: 0,
      }),
    ).rejects.toMatchObject({ code: "CHECKPOINT_CONFLICT" });
    const newer = await cms.save(editor, input(page, "Other editor saved"));
    const stale = await cms.checkpoints.save(owner, {
      ...input(page, "Owner still editing"),
      expectedCheckpointVersion: 1,
    });
    expect(stale.checkpoint?.stale).toBe(true);
    expect(stale.checkpoint?.baseRevisionId).toBe(page.draft.id);
    expect((await cms.detail(owner, page.id, "en")).draft.id).toBe(
      newer.draft.id,
    );
    await expect(
      cms.checkpoints.discard(owner, {
        id: page.id,
        locale: "en",
        expectedCheckpointVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "CHECKPOINT_CONFLICT" });
    await cms.checkpoints.discard(owner, {
      id: page.id,
      locale: "en",
      expectedCheckpointVersion: 2,
    });
    expect(
      (await cms.checkpoints.read(owner, { id: page.id, locale: "en" }))
        .checkpoint,
    ).toBeNull();
  });

  it("saved patterns and combined previews stay private and reject changed shared revisions", async () => {
    const { cms, db, media, authorization, installedClub } = get();
    const { owner } = await installedClub();
    const section = await cms.workspace.savePattern(owner, {
      title: "Reusable welcome",
      locale: "en",
      data: richText("Saved section draft"),
    });
    expect(section.kind).toBe("section");
    expect(section.publishedRevisionId).toBeNull();
    let page = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Composed preview",
    });
    page = await cms.save(
      owner,
      input(page, page.draft.title, {
        root: { props: {} },
        content: [
          {
            type: "SharedSection",
            props: { id: "shared", version: 1, sectionId: section.id },
          },
        ],
      }),
    );
    const previews = new CmsPreviewService(
      db,
      cms,
      new EventService(db, authorization),
      media,
    );
    const composition = await previews.reviewComposition(owner, input(page));
    expect(composition.parts).toContainEqual({
      id: section.id,
      expectedRevisionId: section.draft.id,
    });
    const snapshot = await previews.create(owner, {
      ...input(page, "Unsaved composed title"),
      composition,
    });
    const snapshotId = new URL(
      snapshot.url,
      "http://localhost",
    ).searchParams.get("snapshot")!;
    const rendered = await previews.read(owner, page.id, "en", snapshotId);
    expect(rendered.page.title).toBe("Unsaved composed title");
    expect(rendered.page.sections[section.id]).toEqual(section.draft.data);
    expect(rendered.site).not.toBeNull();
    expect(await cms.publicPage("en", page.draft.slug)).toBeNull();
    await expect(
      previews.read(
        { ...owner, sessionId: randomUUID() },
        page.id,
        "en",
        snapshotId,
      ),
    ).rejects.toMatchObject({ code: "PREVIEW_UNAVAILABLE" });
    await cms.save(owner, input(section, "Changed section"));
    await expect(
      previews.read(owner, page.id, "en", snapshotId),
    ).rejects.toMatchObject({ code: "COMPOSITION_CONFLICT" });
  });
}
