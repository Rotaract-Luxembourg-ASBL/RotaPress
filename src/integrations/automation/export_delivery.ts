import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { automationExport } from "../../../db/schema/automation-runtime";
import { DomainError } from "@/core/DomainError";
import { ContentGeneration } from "@/core/content/ContentGeneration";
import { FormScopePolicy } from "@/features/forms/FormScopePolicy";
import { reauthorizeContext, type AutomationContext } from "./operation";

export const exportInfo = z.strictObject({
  id: z.uuid(),
  formId: z.uuid(),
  mimeType: z.literal("text/csv;charset=utf-8"),
  byteLength: z.int().nonnegative(),
  sha256: z.string().length(64),
  expiresAt: z.iso.datetime(),
  chunkSize: z.literal(65536),
  downloadUrl: z
    .string()
    .regex(/^\/api\/v1\/response-exports\/[a-f0-9-]+\/download$/u),
});
export const exportRowInfo = (row: typeof automationExport.$inferSelect) => ({
  id: row.id,
  formId: row.formId,
  mimeType: "text/csv;charset=utf-8" as const,
  byteLength: row.size,
  sha256: row.sha256,
  expiresAt: row.expiresAt.toISOString(),
  chunkSize: 65536 as const,
  downloadUrl: `/api/v1/response-exports/${row.id}/download`,
});

/** The same current authority protects MCP chunks and authenticated REST bytes. */
export async function readPrivateExport(
  context: AutomationContext,
  id: string,
) {
  z.uuid().parse(id);
  const { principal, services } = context;
  await reauthorizeContext(context);
  if (!principal.scopes.includes("responses:export"))
    throw new DomainError(
      "AUTOMATION_SCOPE_REQUIRED",
      "This connection needs responses:export.",
      403,
    );
  const current = await services.authorization.require(
    principal.actor,
    "submissions.export",
  );
  if (current.organizationId !== principal.organizationId)
    throw new DomainError(
      "AUTOMATION_ORGANIZATION_CHANGED",
      "Create a connection for the current club.",
      403,
    );
  const [row] = await services.automationRuntime.database
    .select()
    .from(automationExport)
    .where(
      and(
        eq(automationExport.id, id),
        eq(automationExport.organizationId, principal.organizationId),
        eq(automationExport.actorUserId, principal.actor.userId),
        eq(automationExport.connectionId, principal.keyId),
      ),
    );
  if (!row || row.expiresAt <= new Date())
    throw new DomainError(
      "EXPORT_EXPIRED",
      "This export is unavailable or expired. Request a new export with a new request ID.",
      410,
    );
  await ContentGeneration.assertCurrent(
    principal.organizationId,
    row.generation,
    services.automationRuntime.database,
  );
  await new FormScopePolicy(
    services.automationRuntime.database,
    services.authorization,
  ).require(principal.actor, row.formId, "submissions.export");
  await reauthorizeContext(context);
  return row;
}

export async function exportDownloadResponse(
  context: AutomationContext,
  id: string,
  head = false,
) {
  const row = await readPrivateExport(context, id);
  const bytes = Buffer.from(row.data, "utf8");
  if (
    bytes.length !== row.size ||
    bytes.length > 10 * 1024 * 1024 ||
    createHash("sha256").update(bytes).digest("hex") !== row.sha256
  )
    throw new DomainError(
      "EXPORT_INVALID",
      "The export could not be read. Create a new export.",
      422,
    );
  return new Response(head ? null : new Uint8Array(bytes), {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Length": String(row.size),
      "Content-Disposition": `attachment; filename="responses-${row.id}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Authorization",
    },
  });
}
