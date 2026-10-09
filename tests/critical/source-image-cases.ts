import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mediaAsset } from "../../db/schema/media";
import { ReferenceWebsiteClient } from "../../src/integrations/automation/ReferenceWebsiteClient";
import { sourceImageOperations } from "../../src/integrations/automation/source_image_operations";
import type { AutomationContext } from "../../src/integrations/automation/operation";
import type { Database } from "../../src/infrastructure/database/client";
import type { MediaService } from "../../src/features/media/MediaService";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";

type Context = {
  db: Database;
  media: MediaService;
  authorization: AuthorizationService;
  imageBytes: Buffer;
  installedClub: () => Promise<{
    owner: TrustedActor;
    scope: { organizationId: string };
  }>;
};

export function sourceImageChecks(context: () => Context) {
  describe("C14 source image import with real private media storage", () => {
    async function fixture() {
      const ctx = context();
      const { owner, scope } = await ctx.installedClub();
      let calls = 0;
      const sources = new ReferenceWebsiteClient({
        async read(url) {
          calls++;
          return url.endsWith("/robots.txt")
            ? { status: 404, type: "text/plain", text: "" }
            : {
                status: 200,
                type: "image/png",
                text: "",
                bytes: ctx.imageBytes,
              };
        },
      });
      const automation = {
        principal: {
          actor: owner,
          keyId: "synthetic-source-image",
          organizationId: scope.organizationId,
          scopes: ["sources:read", "media:write"],
          sourceOrigins: ["rotaract.lu"],
        },
        sources,
        services: {
          media: ctx.media,
          authorization: ctx.authorization,
          limiter: { consume: async () => {} },
        },
      } as unknown as AutomationContext;
      automation.reauthorize = async () => automation.principal;
      return {
        ctx,
        automation,
        calls: () => calls,
        input: {
          requestId: randomUUID(),
          url: "https://www.rotaract.lu/photo.png",
          filename: "club-photo.png",
          alt: "Synthetic club photo",
          rightsConfirmed: true,
        },
      };
    }

    it("normalizes imported pixels privately and reuses identical actor-bound retries", async () => {
      const { ctx, automation, input } = await fixture();
      const first = (await sourceImageOperations[0].run(automation, input)) as {
        asset: { id: string; visibility: string; mimeType: string };
        metadataRevision: string;
      };
      expect(first.asset).toMatchObject({
        visibility: "private",
        mimeType: "image/webp",
      });
      expect(first.metadataRevision).toMatch(/^[a-f0-9]{64}$/);
      const repeated = await sourceImageOperations[0].run(automation, input);
      expect(repeated).toEqual(first);
      expect(await ctx.db.select().from(mediaAsset)).toHaveLength(1);
      await expect(
        sourceImageOperations[0].run(automation, {
          ...input,
          url: "https://www.rotaract.lu/another-photo.png",
        }),
      ).rejects.toMatchObject({ code: "MEDIA_UPLOAD_RETRY_CHANGED" });
      expect(await ctx.db.select().from(mediaAsset)).toHaveLength(1);
      await expect(ctx.media.read(null, first.asset.id)).rejects.toMatchObject({
        code: "MEDIA_NOT_FOUND",
      });
      await expect(
        sourceImageOperations[0].run(automation, {
          ...input,
          alt: "Changed retry",
        }),
      ).rejects.toMatchObject({ code: "MEDIA_UPLOAD_RETRY_CHANGED" });
      expect(await ctx.db.select().from(mediaAsset)).toHaveLength(1);
    });

    it("rejects missing grants/rights before fetching and removed source authority before persisting", async () => {
      const { ctx, automation, input, calls } = await fixture();
      await expect(
        sourceImageOperations[0].run(automation, {
          ...input,
          rightsConfirmed: false,
        }),
      ).rejects.toThrow();
      automation.principal.scopes = ["media:write"];
      await expect(
        sourceImageOperations[0].run(automation, input),
      ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
      expect(calls()).toBe(0);
      automation.principal.scopes = ["sources:read", "media:write"];
      automation.reauthorize = async () => ({
        ...automation.principal,
        sourceOrigins: [],
      });
      await expect(
        sourceImageOperations[0].run(automation, input),
      ).rejects.toMatchObject({ code: "SOURCE_ORIGIN_DENIED" });
      expect(calls()).toBe(2);
      expect(await ctx.db.select().from(mediaAsset)).toHaveLength(0);
    });
  });
}
