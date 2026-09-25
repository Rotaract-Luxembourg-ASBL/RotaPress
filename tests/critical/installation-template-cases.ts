import { expect, it } from "vitest";
import type { Database } from "../../src/infrastructure/database/client";
import { installation, organization } from "../../db/schema/club";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { InstallationService } from "../../src/core/installation/InstallationService";
import { CmsService } from "../../src/features/cms/CmsService";
import { WebsiteSetupService } from "../../src/features/cms/WebsiteSetupService";
import { CmsKitService } from "../../src/features/cms/kits/CmsKitService";
import { FormService } from "../../src/features/forms/FormService";
import { MediaService } from "../../src/features/media/MediaService";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import { resolve } from "node:path";

export function installationTemplateChecks(
  get: () => {
    db: Database;
    authorization: AuthorizationService;
    actor: (label: string) => Promise<TrustedActor>;
    prepareClaim: (actor: TrustedActor) => Promise<object>;
  },
) {
  it("C01 installs the selected theme and complete private website atomically with owner setup", async () => {
    const { db, authorization, actor, prepareClaim } = get();
    const owner = await actor("template-owner");
    const claim = await prepareClaim(owner);
    const media = new MediaService(
      db,
      authorization,
      new LocalStorageDriver(resolve(".local/test-uploads")),
    );
    const forms = new FormService(db, authorization);
    const cms = new CmsService(db, authorization, media, forms);
    const kits = new CmsKitService(db, authorization, media, cms, forms, true);
    const website = new WebsiteSetupService(
      db,
      authorization,
      media,
      cms,
      kits,
    );
    // Failure must keep both the claim and installation available for a safe retry.
    const broken = new InstallationService(db, {
      selectTemplate: async () => {
        throw new Error("Synthetic template failure");
      },
    });
    await expect(
      broken.complete(owner, { ...claim, templateId: "rotaract-action" }),
    ).rejects.toThrow("Synthetic template failure");
    expect(await db.select().from(organization)).toHaveLength(0);
    expect((await db.select().from(installation))[0].completedAt).toBeNull();
    const result = await new InstallationService(db, website).complete(owner, {
      ...claim,
      templateId: "rotaract-action",
      profile: {
        clubType: "rotaract",
        districtNumber: "2160",
        city: "Example city",
        country: "Example country",
        polarisUrl: "https://portal.example.test/club",
      },
    });
    expect(result.profile).toMatchObject({
      districtNumber: "2160",
      city: "Example city",
    });
    const workspace = await website.workspace(owner, "en");
    expect(workspace.site.draft.themeId).toBe("rotaract-action");
    expect(workspace.selection?.kitId).toBe("rotaract-action");
    expect(workspace.site.draft.homePageId).toBeTruthy();
    expect(workspace.site.draft.headerId).toBeTruthy();
    expect(workspace.site.draft.footerId).toBeTruthy();
    expect(workspace.contents.length).toBeGreaterThan(8);
    expect(workspace.contents.every((item) => !item.publishedRevisionId)).toBe(
      true,
    );
    expect((await cms.publicHome("en")).page).toBeNull();
    await expect(
      new InstallationService(db, website).complete(owner, {
        ...claim,
        templateId: "rotaract-action",
      }),
    ).rejects.toMatchObject({ code: "SETUP_CLAIM_INVALID" });
    expect((await website.workspace(owner, "en")).contents).toHaveLength(
      workspace.contents.length,
    );
  });
}
