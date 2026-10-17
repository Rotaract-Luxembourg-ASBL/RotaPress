import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { automationReceipt } from "../../db/schema/automation-runtime";
import { mediaAsset } from "../../db/schema/media";
import type { Database } from "../../src/infrastructure/database/client";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { MediaService } from "../../src/features/media/MediaService";
import { mediaMetadataRevision } from "../../src/features/media/media_automation";
import { AutomationRuntime } from "../../src/integrations/automation/receipt_service";
import { executeOperation } from "../../src/integrations/automation/catalogue";
import type { AutomationContext } from "../../src/integrations/automation/operation";
import { mediaDetailOutput } from "../../src/integrations/automation/media_schemas";
import type { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";

type Fixture = {
  db: Database;
  media: MediaService;
  authorization: AuthorizationService;
  imageBytes: Buffer;
  driver: LocalStorageDriver;
  installedClub: () => Promise<{
    owner: TrustedActor;
    scope: { organizationId: string };
  }>;
};

export function automationMediaManagementChecks(get: () => Fixture) {
  async function fixture() {
    const f = get();
    const { owner, scope } = await f.installedClub();
    const image = await f.media.uploadFromAdministration(owner, {
      filename: "management.png",
      bytes: f.imageBytes,
      title: "Original",
    });
    const context = {
      services: {
        media: f.media,
        authorization: f.authorization,
        automationRuntime: new AutomationRuntime(f.db),
        limiter: { consume: async () => undefined },
      },
      principal: {
        actor: owner,
        organizationId: scope.organizationId,
        keyId: "media-management-fixture",
        scopes: ["media:manage", "files:manage"],
        sourceOrigins: [],
      },
    } as unknown as AutomationContext;
    return { ...f, owner, scope, image, context };
  }

  it("C14 media management: cleanup preserves live files and survives a lost authorized deletion response", async () => {
    const f = await fixture();
    const [row] = await f.db
      .select()
      .from(mediaAsset)
      .where(eq(mediaAsset.id, f.image.id));
    await f.media.cleanupDeleted([row.storageKey]);
    expect((await f.driver.read(row.storageKey)).length).toBeGreaterThan(0);
    let checks = 0;
    f.context.reauthorize = async () =>
      ++checks === 1
        ? f.context.principal
        : { ...f.context.principal, scopes: [] };
    await expect(
      executeOperation(f.context, "media_delete", {
        assets: [
          { id: f.image.id, expectedRevision: mediaMetadataRevision(f.image) },
        ],
        confirmed: true,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "AUTOMATION_ACCESS_CHANGED" });
    expect(
      await f.db.select().from(mediaAsset).where(eq(mediaAsset.id, f.image.id)),
    ).toHaveLength(0);
    await expect(f.driver.read(row.storageKey)).rejects.toThrow();
  });

  it("C14 media management: new grants stay opt-in and image/file families cannot cross", async () => {
    const f = await fixture();
    const input = {
      id: f.image.id,
      expectedRevision: mediaMetadataRevision(f.image),
      title: "Updated",
      requestId: randomUUID(),
    };
    await expect(
      executeOperation(
        {
          ...f.context,
          principal: {
            ...f.context.principal,
            scopes: ["media:write", "media:publish"],
          },
        },
        "media_details_save",
        input,
      ),
    ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
    await expect(
      executeOperation(f.context, "files_details_save", input),
    ).rejects.toMatchObject({ code: "MEDIA_KIND_REQUIRED" });
    expect(await f.db.select().from(automationReceipt)).toHaveLength(0);
    const result = await executeOperation(
      f.context,
      "media_details_save",
      input,
    );
    expect(result).toMatchObject({
      asset: { id: f.image.id, title: "Updated", visibility: "public" },
    });
    await f.media.update(f.owner, {
      id: f.image.id,
      visibility: "public",
      title: "Later native edit",
    });
    expect(
      await executeOperation(f.context, "media_details_save", input),
    ).toEqual(result);
    expect((await f.media.detail(f.owner, f.image.id)).title).toBe(
      "Later native edit",
    );
  });

  it("C14 media management: retained references block atomic hide/delete and deletion replays safely", async () => {
    const f = await fixture();
    const second = await f.media.uploadFromAdministration(f.owner, {
      filename: "second.png",
      bytes: f.imageBytes,
    });
    const target = (asset: typeof second) => ({
      id: asset.id,
      expectedRevision: mediaMetadataRevision(asset),
    });
    await f.db.transaction((tx) =>
      f.media.replaceUsage(
        "synthetic-published-reference",
        f.scope.organizationId,
        [second.id],
        tx,
        true,
      ),
    );
    const input = {
      assets: [target(f.image), target(second)],
      confirmed: true,
      requestId: randomUUID(),
    };
    await expect(
      executeOperation(f.context, "media_hide", input),
    ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
    await expect(
      executeOperation(f.context, "media_delete", input),
    ).rejects.toMatchObject({ code: "MEDIA_REFERENCED" });
    expect((await f.media.detail(f.owner, f.image.id)).visibility).toBe(
      "public",
    );
    expect(await f.db.select().from(automationReceipt)).toHaveLength(0);
    const single = { ...input, assets: [target(f.image)] };
    expect(await executeOperation(f.context, "media_delete", single)).toEqual({
      deletedIds: [f.image.id],
    });
    expect(await executeOperation(f.context, "media_delete", single)).toEqual({
      deletedIds: [f.image.id],
    });
    await expect(f.media.read(null, f.image.id)).rejects.toMatchObject({
      code: "MEDIA_NOT_FOUND",
    });
    expect(
      await f.db.select().from(mediaAsset).where(eq(mediaAsset.id, second.id)),
    ).toHaveLength(1);
  });

  it("C14 media management: transforms make a private copy and recover it after later source edits", async () => {
    const f = await fixture();
    const input = {
      id: f.image.id,
      requestId: randomUUID(),
      expectedRevision: mediaMetadataRevision(f.image),
      rotate: 90,
      crop: { left: 0, top: 0, width: 4, height: 3 },
      flipHorizontal: true,
    };
    const result = mediaDetailOutput.parse(
      await executeOperation(f.context, "media_edit_copy", input),
    );
    expect(result.asset).toMatchObject({
      visibility: "private",
      width: 3,
      height: 4,
    });
    expect(result.asset.id).not.toBe(f.image.id);
    expect((await f.media.detail(f.owner, f.image.id)).visibility).toBe(
      "public",
    );
    await f.media.update(f.owner, {
      id: f.image.id,
      title: "Later source edit",
      visibility: "public",
    });
    expect(await executeOperation(f.context, "media_edit_copy", input)).toEqual(
      result,
    );
    expect(await f.db.select().from(mediaAsset)).toHaveLength(2);
    await expect(f.media.read(null, result.asset.id)).rejects.toMatchObject({
      code: "MEDIA_NOT_FOUND",
    });
  });
}
