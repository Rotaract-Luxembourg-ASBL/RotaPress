import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { z } from "zod";
import { membership } from "../../db/schema/club";
import { automationExport } from "../../db/schema/automation-runtime";
import { formSubmission } from "../../db/schema/forms";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import type { FormService, SubmissionService } from "../../src/features/forms";
import { AutomationRuntime } from "../../src/integrations/automation/receipt_service";
import {
  exportInfo,
  exportDownloadResponse,
} from "../../src/integrations/automation/export_delivery";
import { executeOperation } from "../../src/integrations/automation/catalogue";
import type { AutomationContext } from "../../src/integrations/automation/operation";

export function automationExportCases(
  get: () => {
    db: Database;
    authorization: AuthorizationService;
    forms: FormService;
    submissions: SubmissionService;
    installedClub: () => Promise<{
      owner: TrustedActor;
      scope: { organizationId: string };
    }>;
  },
) {
  it("expires private exports in bounded batches without removing live snapshots", async () => {
    const { db, installedClub } = get();
    const { owner, scope } = await installedClub();
    const row = {
      organizationId: scope.organizationId,
      actorUserId: owner.userId,
      connectionId: "expiry-fixture",
      generation: randomUUID(),
      formId: randomUUID(),
      data: "",
      size: 0,
      sha256: createHash("sha256").update("").digest("hex"),
    };
    await db
      .insert(automationExport)
      .values(
        Array.from({ length: 205 }, () => ({ ...row, expiresAt: new Date(0) })),
      );
    const [live] = await db
      .insert(automationExport)
      .values({ ...row, expiresAt: new Date(Date.now() + 60_000) })
      .returning({ id: automationExport.id });
    const runtime = new AutomationRuntime(db);
    expect(await runtime.expireExports()).toEqual({ expired: 100 });
    expect(await runtime.expireExports()).toEqual({ expired: 100 });
    expect(await runtime.expireExports()).toEqual({ expired: 5 });
    expect(await runtime.expireExports()).toEqual({ expired: 0 });
    expect(
      await db.select({ id: automationExport.id }).from(automationExport),
    ).toEqual([live]);
  });

  it("delivers matching private CSV chunks and authenticated downloads only to the current owning connection", async () => {
    const { db, forms, submissions, authorization, installedClub } = get();
    const { owner, scope } = await installedClub();
    const draft = await forms.create(owner, { kind: "contact" });
    await forms.publish(owner, draft.id, {
      expectedRevision: draft.draftRevision,
    });
    const published = await forms.publicForm(draft.id);
    await db.insert(formSubmission).values(
      Array.from({ length: 20 }, () => ({
        organizationId: scope.organizationId,
        formId: draft.id,
        versionId: published.versionId,
        requestId: randomUUID(),
        payloadHash: "a".repeat(64),
        answers: {
          name: "Synthetic export",
          email: "export@example.test",
          message: "Private recovery fixture. ".repeat(200),
        },
      })),
    );
    const context = {
      services: {
        authorization,
        submissions,
        automationRuntime: new AutomationRuntime(db),
      },
      principal: {
        actor: owner,
        organizationId: scope.organizationId,
        keyId: "synthetic-export",
        scopes: ["responses:export"],
        sourceOrigins: [],
      },
    } as unknown as AutomationContext;
    const input = { formId: draft.id, requestId: randomUUID() };
    const exported = exportInfo.parse(
      await executeOperation(context, "responses_export", input),
    );
    expect(exported.byteLength).toBeGreaterThan(65536);
    expect(await executeOperation(context, "responses_export", input)).toEqual(
      exported,
    );
    const chunkSchema = exportInfo.extend({
      offset: z.number(),
      data: z.string(),
      nextOffset: z.number().nullable(),
    });
    const first = chunkSchema.parse(
      await executeOperation(context, "responses_export_read", {
        id: exported.id,
      }),
    );
    const second = chunkSchema.parse(
      await executeOperation(context, "responses_export_read", {
        id: exported.id,
        offset: first.nextOffset,
      }),
    );
    const bytes = Buffer.concat([
      Buffer.from(first.data, "base64"),
      Buffer.from(second.data, "base64"),
    ]);
    expect(second.nextOffset).toBeNull();
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      exported.sha256,
    );
    const download = await exportDownloadResponse(context, exported.id);
    expect(download.headers.get("cache-control")).toBe("private, no-store");
    expect(download.headers.get("content-disposition")).toContain(
      "attachment;",
    );
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
    const head = await exportDownloadResponse(context, exported.id, true);
    expect(await head.text()).toBe("");
    expect(head.headers.get("content-length")).toBe(String(bytes.length));
    await expect(
      exportDownloadResponse(
        { ...context, principal: { ...context.principal, keyId: "different" } },
        exported.id,
      ),
    ).rejects.toMatchObject({ code: "EXPORT_EXPIRED" });
    await expect(
      exportDownloadResponse(
        {
          ...context,
          principal: { ...context.principal, scopes: ["forms:read"] },
        },
        exported.id,
      ),
    ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
    await expect(
      exportDownloadResponse(
        {
          ...context,
          reauthorize: async () => ({ ...context.principal, scopes: [] }),
        },
        exported.id,
      ),
    ).rejects.toMatchObject({ code: "AUTOMATION_ACCESS_CHANGED" });
    await db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, owner.userId));
    await expect(
      exportDownloadResponse(context, exported.id),
    ).rejects.toThrow();
    await db
      .update(membership)
      .set({ status: "approved" })
      .where(eq(membership.userId, owner.userId));
    await db
      .update(automationExport)
      .set({ expiresAt: new Date(0) })
      .where(eq(automationExport.id, exported.id));
    await expect(
      exportDownloadResponse(context, exported.id),
    ).rejects.toMatchObject({ code: "EXPORT_EXPIRED" });
  });
}
