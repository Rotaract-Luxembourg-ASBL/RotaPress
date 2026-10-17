import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import sharp from "sharp";
import { automationReceipt } from "../../db/schema/automation-runtime";
import type { Database } from "../../src/infrastructure/database/client";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms/CmsService";
import { MediaService } from "../../src/features/media/MediaService";
import { mediaAsset } from "../../db/schema/media";
import { FormService } from "../../src/features/forms/FormService";
import { mediaMetadataRevision } from "../../src/features/media/media_automation";
import { defaultSiteSettings } from "../../src/features/cms/cms_schemas";
import { websiteDetailOutput } from "../../src/integrations/automation/response_schemas";
import { formOutput } from "../../src/integrations/automation/response_schemas";
import { mediaDetailOutput } from "../../src/integrations/automation/media_schemas";
import { AutomationRuntime } from "../../src/integrations/automation/receipt_service";
import { ContentImportService } from "../../src/integrations/automation/ContentImportService";
import { executeOperation } from "../../src/integrations/automation/catalogue";
import type { AutomationContext } from "../../src/integrations/automation/operation";
import { PartnerService } from "../../src/features/partners/PartnerService";
import { directoryExample } from "../../src/integrations/automation/examples";

type Context = {
  db: Database;
  cms: CmsService;
  media: MediaService;
  authorization: AuthorizationService;
  installedClub: () => Promise<{
    owner: TrustedActor;
    scope: { organizationId: string };
  }>;
};

/** Lost responses are replayed from the same committed transaction, not resaved. */
export function automationContentReceiptChecks(get: () => Context) {
  async function fixture() {
    const c = get();
    const { owner, scope } = await c.installedClub();
    const forms = new FormService(c.db, c.authorization);
    const context = {
      services: {
        authorization: c.authorization,
        cms: c.cms,
        media: c.media,
        forms,
        automationRuntime: new AutomationRuntime(c.db),
        limiter: { consume: async () => undefined },
      },
      imports: new ContentImportService(c.db, c.authorization, c.cms),
      principal: {
        actor: owner,
        organizationId: scope.organizationId,
        keyId: "content-receipts",
        scopes: [
          "website:write",
          "website:manage",
          "website:organize",
          "website:settings",
          "website:publish",
          "forms:write",
          "forms:publish",
          "media:write",
          "media:publish",
        ],
        sourceOrigins: [],
      },
    } as unknown as AutomationContext;
    return { ...c, owner, forms, context };
  }
  it("C14 content receipts: archived pages restore as drafts and replay without changing later state", async () => {
    const f = await fixture();
    const page = await f.cms.create(f.owner, {
      kind: "page",
      title: "Restore receipt",
      locale: "en",
      slug: "restore-receipt",
    });
    const command = {
      id: page.id,
      locale: "en",
      expectedRevisionId: page.draft.id,
    };
    await f.cms.archive(f.owner, command);
    const input = {
      requestId: randomUUID(),
      items: [{ ...command, archived: true }],
    };
    expect(
      await executeOperation(f.context, "website_pages_restore", input),
    ).toEqual({ updated: 1 });
    const restored = await f.cms.detail(f.owner, page.id, "en");
    expect(restored.archived).toBe(false);
    expect(restored.publishedRevisionId).toBeNull();
    await f.cms.archive(f.owner, command);
    expect(
      await executeOperation(f.context, "website_pages_restore", input),
    ).toEqual({ updated: 1 });
    expect((await f.cms.detail(f.owner, page.id, "en")).archived).toBe(true);
  });
  it("C14 content receipts: directory mutations do not retain contextual placement titles", async () => {
    const f = await fixture();
    f.context.principal.scopes = ["directory:write"];
    f.context.services.partners = new PartnerService(
      f.db,
      f.authorization,
      f.media,
      {
        placements: async () => [
          {
            id: null,
            eventId: null,
            locale: "en",
            title: "Synthetic restricted event placement",
          },
        ],
      },
    );
    const input = { ...directoryExample, requestId: randomUUID() };
    const saved = await executeOperation(f.context, "directory_create", input);
    expect(saved).not.toHaveProperty("placements");
    expect(JSON.stringify(saved)).not.toContain(
      "Synthetic restricted event placement",
    );
    const [receipt] = await f.db
      .select()
      .from(automationReceipt)
      .where(eq(automationReceipt.requestId, input.requestId));
    expect(JSON.stringify(receipt.result)).not.toContain(
      "Synthetic restricted event placement",
    );
    expect(
      await executeOperation(f.context, "directory_create", input),
    ).toEqual(saved);
  });
  it("C14 content receipts: creation, save, locale, settings and publication replay original results", async () => {
    const f = await fixture();
    const create = {
      requestId: randomUUID(),
      kind: "page",
      locale: "en",
      title: "Receipt page",
      slug: "receipt-page",
    };
    const initial = websiteDetailOutput.parse(
      await executeOperation(f.context, "website_create", create),
    );
    expect(await executeOperation(f.context, "website_create", create)).toEqual(
      initial,
    );
    const save = {
      requestId: randomUUID(),
      id: initial.id,
      locale: "en",
      expectedRevisionId: initial.draft.id,
      title: "Saved once",
      slug: initial.draft.slug,
      description: "",
      socialImageId: null,
      data: initial.draft.data,
    };
    const saved = websiteDetailOutput.parse(
      await executeOperation(f.context, "website_save", save),
    );
    expect(saved.draft.id).not.toBe(initial.draft.id);
    expect(await executeOperation(f.context, "website_save", save)).toEqual(
      saved,
    );
    const publication = {
      requestId: randomUUID(),
      id: saved.id,
      locale: "en",
      expectedRevisionId: saved.draft.id,
      confirmed: true,
    };
    const published = await executeOperation(
      f.context,
      "website_publish",
      publication,
    );
    const latest = await f.cms.save(f.owner, {
      id: saved.id,
      locale: "en",
      expectedRevisionId: saved.draft.id,
      title: "Later native draft",
      slug: saved.draft.slug,
      description: "",
      socialImageId: null,
      data: saved.draft.data,
    });
    expect(
      await executeOperation(f.context, "website_publish", publication),
    ).toEqual(published);
    expect(await executeOperation(f.context, "website_save", save)).toEqual(
      saved,
    );
    expect((await f.cms.detail(f.owner, initial.id, "en")).draft.id).toBe(
      latest.draft.id,
    );
    const locale = {
      requestId: randomUUID(),
      id: initial.id,
      locale: "fr",
      title: "Page française",
      slug: "page-francaise",
    };
    const language = await executeOperation(
      f.context,
      "website_locale_create",
      locale,
    );
    expect(
      await executeOperation(f.context, "website_locale_create", locale),
    ).toEqual(language);
    const settings = {
      requestId: randomUUID(),
      locale: "en",
      expectedVersion: 0,
      settings: defaultSiteSettings,
    };
    const site = await executeOperation(
      f.context,
      "website_settings_save",
      settings,
    );
    expect(
      await executeOperation(f.context, "website_settings_save", settings),
    ).toEqual(site);
    expect((await f.cms.getSite(f.owner, "en")).version).toBe(1);
    await expect(
      executeOperation(f.context, "website_save", {
        ...save,
        title: "Changed retry",
      }),
    ).rejects.toMatchObject({ code: "AUTOMATION_REQUEST_CHANGED" });
    expect(
      (await f.cms.list(f.owner)).filter(
        (page) => page.id === initial.id && page.locale === "en",
      ),
    ).toHaveLength(1);
  });

  it("C14 content receipts: form creation/save/publication remain one mutation after interruption", async () => {
    const f = await fixture();
    const create = {
      requestId: randomUUID(),
      title: "Receipt contact",
      kind: "contact",
    };
    const initial = formOutput.parse(
      await executeOperation(f.context, "forms_create", create),
    );
    expect(await executeOperation(f.context, "forms_create", create)).toEqual(
      initial,
    );
    const save = {
      requestId: randomUUID(),
      id: initial.id,
      expectedRevision: initial.draftRevision,
      definition: { ...initial.draft, title: "Saved contact" },
    };
    const saved = formOutput.parse(
      await executeOperation(f.context, "forms_save", save),
    );
    expect(await executeOperation(f.context, "forms_save", save)).toEqual(
      saved,
    );
    const publish = {
      requestId: randomUUID(),
      id: initial.id,
      expectedRevision: saved.draftRevision,
      confirmed: true,
    };
    const published = await executeOperation(
      f.context,
      "forms_publish",
      publish,
    );
    expect(await executeOperation(f.context, "forms_publish", publish)).toEqual(
      published,
    );
    expect((await f.forms.detail(f.owner, initial.id)).draftRevision).toBe(
      initial.draftRevision + 1,
    );
    const [receipt] = await f.db
      .select()
      .from(automationReceipt)
      .where(eq(automationReceipt.requestId, save.requestId));
    expect(receipt.result).toEqual(saved);
    await expect(
      executeOperation(
        {
          ...f.context,
          principal: { ...f.context.principal, keyId: "other-client" },
        },
        "forms_create",
        create,
      ),
    ).rejects.toMatchObject({ code: "AUTOMATION_REQUEST_CHANGED" });
  });

  it("C14 content receipts: media metadata and visibility return original fingerprints on retry", async () => {
    const f = await fixture();
    const asset = await f.media.upload(f.owner, {
      filename: "fixture.png",
      alt: "Before",
      bytes: await sharp({
        create: { width: 2, height: 2, channels: 3, background: "#257" },
      })
        .png()
        .toBuffer(),
    });
    const input = {
      requestId: randomUUID(),
      id: asset.id,
      expectedRevision: mediaMetadataRevision(asset),
      title: "Receipt image",
      alt: "After",
      caption: "",
      tags: [],
      collection: "",
    };
    const saved = mediaDetailOutput.parse(
      await executeOperation(f.context, "media_metadata_save", input),
    );
    expect(
      await executeOperation(f.context, "media_metadata_save", input),
    ).toEqual(saved);
    const publish = {
      requestId: randomUUID(),
      assets: [{ id: asset.id, expectedRevision: saved.metadataRevision }],
      confirmed: true,
    };
    const published = await executeOperation(
      f.context,
      "media_publish",
      publish,
    );
    expect(await executeOperation(f.context, "media_publish", publish)).toEqual(
      published,
    );
    expect(
      await executeOperation(f.context, "media_metadata_save", input),
    ).toEqual(saved);
    expect((await f.media.detail(f.owner, asset.id)).visibility).toBe("public");
    await f.media.delete(f.owner, asset.id);
    await expect(
      executeOperation(f.context, "media_publish", publish),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("C14 content receipts: upload cleanup follows the committed transaction even when the response fails", async () => {
    const f = await fixture();
    const files = new Map<string, Buffer>();
    const media = new MediaService(f.db, f.authorization, {
      async write(bytes) {
        const key = `${randomUUID()}.webp`;
        files.set(key, bytes);
        return key;
      },
      async read(key) {
        const bytes = files.get(key);
        if (!bytes) throw new Error("Missing stored fixture");
        return bytes;
      },
      async delete(key) {
        files.delete(key);
      },
    });
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#257" },
    })
      .png()
      .toBuffer();
    const nativeInput = {
      filename: "receipt.png",
      alt: "Receipt fixture",
      bytes,
    };
    await expect(
      media.upload(f.owner, nativeInput, undefined, (persist) =>
        f.db.transaction(async (tx) => {
          await persist(tx);
          throw new Error("rollback fixture");
        }),
      ),
    ).rejects.toThrow("rollback fixture");
    expect(files.size).toBe(0);
    expect(await f.db.select().from(mediaAsset)).toHaveLength(0);
    await expect(
      media.upload(f.owner, nativeInput, undefined, async (persist) => {
        await f.db.transaction(persist);
        throw new Error("response lost after commit");
      }),
    ).rejects.toThrow("response lost after commit");
    expect(files.size).toBe(1);
    expect(await f.db.select().from(mediaAsset)).toHaveLength(1);
    const context = {
      ...f.context,
      services: { ...f.context.services, media },
    };
    const input = {
      requestId: randomUUID(),
      filename: "replayed.png",
      alt: "Original",
      mimeType: "image/png",
      data: bytes.toString("base64"),
    };
    const first = mediaDetailOutput.parse(
      await executeOperation(context, "media_upload", input),
    );
    await media.update(f.owner, {
      id: first.asset.id,
      visibility: "private",
      title: "Changed later",
      alt: "Later",
      caption: "",
      tags: [],
      collection: "",
    });
    expect(await executeOperation(context, "media_upload", input)).toEqual(
      first,
    );
    expect(files.size).toBe(2);
    expect(await f.db.select().from(mediaAsset)).toHaveLength(2);
  });
}
