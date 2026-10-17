import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { automationReceipt } from "../../../db/schema/automation-runtime";
import { ContentGeneration } from "@/core/content/ContentGeneration";
import { operation, operationAllowed, reauthorizeContext } from "./operation";
import { exampleId } from "./examples";

export const taskOperations = [
  operation(
    {
      name: "automation_task_receipts",
      method: "GET",
      path: "/tasks/{taskId}/receipts",
      scope: null,
      effect: "read",
      description:
        "Recover a bounded task's completed operation receipts for this exact account and connection. A task is a label for separately committed actions, not a background job or atomic plan. Only currently granted operations are shown; private payloads are excluded. After a content reset old receipts are marked cleared and cannot replay. Retry the identical request to recover its result; unlisted actions may not have committed.",
      input: z.strictObject({
        taskId: z.uuid(),
        offset: z.int().min(0).max(100000).default(0),
        limit: z.int().min(1).max(50).default(20),
      }),
      output: z.strictObject({
        contentGeneration: z.uuid(),
        items: z.array(
          z.strictObject({
            requestId: z.uuid(),
            operation: z.string(),
            completedAt: z.iso.datetime(),
            state: z.enum(["completed", "cleared"]),
          }),
        ),
        nextOffset: z.int().nonnegative().nullable(),
      }),
      example: { taskId: exampleId, limit: 20 },
    },
    async (context, input) => {
      const { operations } = await import("./catalogue");
      const allowed = operations
        .filter((item) => operationAllowed(item, context.principal.scopes))
        .map((item) => item.name);
      const database = context.services.automationRuntime.database;
      const generation = await ContentGeneration.read(
        context.principal.organizationId,
        database,
      );
      const rows = allowed.length
        ? await database
            .select({
              requestId: automationReceipt.requestId,
              operation: automationReceipt.operation,
              createdAt: automationReceipt.createdAt,
              generation: automationReceipt.generation,
            })
            .from(automationReceipt)
            .where(
              and(
                eq(
                  automationReceipt.organizationId,
                  context.principal.organizationId,
                ),
                eq(
                  automationReceipt.actorUserId,
                  context.principal.actor.userId,
                ),
                eq(automationReceipt.connectionId, context.principal.keyId),
                eq(automationReceipt.taskId, input.taskId),
                inArray(automationReceipt.operation, allowed),
              ),
            )
            .orderBy(
              desc(automationReceipt.createdAt),
              desc(automationReceipt.id),
            )
            .offset(input.offset)
            .limit(input.limit + 1)
        : [];
      await reauthorizeContext(context);
      return {
        contentGeneration: generation.generation,
        items: rows
          .slice(0, input.limit)
          .map((row) => ({
            requestId: row.requestId,
            operation: row.operation,
            completedAt: row.createdAt.toISOString(),
            state:
              row.generation === generation.generation
                ? "completed"
                : "cleared",
          })),
        nextOffset:
          rows.length > input.limit ? input.offset + input.limit : null,
      };
    },
  ),
];
