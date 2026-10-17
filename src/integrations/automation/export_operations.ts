import { createHash } from "node:crypto";
import { lt } from "drizzle-orm";
import { z } from "zod";
import { automationExport } from "../../../db/schema/automation-runtime";
import { DomainError } from "@/core/DomainError";
import { ContentGeneration } from "@/core/content/ContentGeneration";
import { FormScopePolicy } from "@/features/forms/FormScopePolicy";
import { submissionFilterSchema } from "@/features/forms/form_schemas";
import { operation } from "./operation";
import { executeReceipt, receiptFields } from "./receipt_service";
import { exampleId } from "./examples";
import {
  exportInfo,
  exportRowInfo,
  readPrivateExport,
} from "./export_delivery";

export const exportOperations = [
  operation(
    {
      name: "responses_export",
      method: "POST",
      path: "/forms/{formId}/exports",
      scope: "responses:export",
      effect: "export",
      description:
        "Create the user's requested private CSV export of one form and exact status/date filter, maximum 5,000 responses and 10 MiB. Read bounded chunks with responses_export_read or download CSV from downloadUrl using this connection's Authorization header. The URL is never public and expires after ten minutes.",
      input: submissionFilterSchema.safeExtend({
        formId: z.uuid(),
        ...receiptFields,
      }),
      output: exportInfo,
      example: { formId: exampleId, status: "closed", requestId: exampleId },
    },
    (context, input) =>
      executeReceipt(
        context,
        "responses_export",
        input,
        exportInfo,
        (tx) =>
          new FormScopePolicy(
            context.services.automationRuntime.database,
            context.services.authorization,
          ).require(
            context.principal.actor,
            input.formId,
            "submissions.export",
            tx,
          ),
        async (tx) => {
          const { formId } = input;
          const filter = submissionFilterSchema.strip().parse(input);
          const csv = await context.services.submissions.exportCsv(
            context.principal.actor,
            formId,
            filter,
            tx,
          );
          const bytes = Buffer.from(csv, "utf8");
          if (bytes.length > 10 * 1024 * 1024)
            throw new DomainError(
              "EXPORT_TOO_LARGE",
              "Narrow the export date range to keep its CSV below 10 MiB.",
              422,
            );
          await tx
            .delete(automationExport)
            .where(lt(automationExport.expiresAt, new Date()));
          const generation = await ContentGeneration.read(
            context.principal.organizationId,
            tx,
          );
          const [row] = await tx
            .insert(automationExport)
            .values({
              organizationId: context.principal.organizationId,
              actorUserId: context.principal.actor.userId,
              connectionId: context.principal.keyId,
              generation: generation.generation,
              formId,
              data: csv,
              size: bytes.length,
              sha256: createHash("sha256").update(bytes).digest("hex"),
              expiresAt: new Date(Date.now() + 600000),
            })
            .returning();
          return exportRowInfo(row);
        },
      ),
  ),
  operation(
    {
      name: "responses_export_read",
      method: "GET",
      path: "/response-exports/{id}",
      scope: "responses:export",
      effect: "read",
      description:
        "Read up to 64 KiB of a private CSV export as base64 bytes. Decode chunks in offset order and verify sha256; follow nextOffset until null. Access is checked on each chunk and revoked connections cannot read exports.",
      input: z.strictObject({
        id: z.uuid(),
        offset: z.coerce.number().int().min(0).max(10485760).default(0),
      }),
      output: exportInfo.extend({
        offset: z.int().nonnegative(),
        data: z.string().max(87384),
        nextOffset: z.int().nonnegative().nullable(),
      }),
      example: { id: exampleId, offset: 0 },
    },
    async (context, input) => {
      const row = await readPrivateExport(context, input.id);
      if (input.offset > row.size)
        throw new DomainError(
          "EXPORT_OFFSET",
          "Choose an offset within the export.",
          422,
        );
      const bytes = Buffer.from(row.data, "utf8").subarray(
        input.offset,
        input.offset + 65536,
      );
      return {
        ...exportRowInfo(row),
        offset: input.offset,
        data: bytes.toString("base64"),
        nextOffset:
          input.offset + bytes.length < row.size
            ? input.offset + bytes.length
            : null,
      };
    },
  ),
];
