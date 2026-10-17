import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  automationExport,
  automationReceipt,
} from "../../../db/schema/automation-runtime";
import type { Database } from "@/infrastructure/database/client";
import {
  DomainError,
  type Transaction,
} from "@/core/authorization/AuthorizationService";
import { ContentGeneration } from "@/core/content/ContentGeneration";
import { reauthorizeContext, type AutomationContext } from "./operation";

export const receiptFields = {
  requestId: z.uuid(),
  taskId: z.uuid().optional(),
  expectedGeneration: z.uuid().optional(),
};
export type ReceiptInput = {
  requestId: string;
  taskId?: string;
  expectedGeneration?: string;
};

/** Receipts commit with domain changes. A retry never bypasses current record authority. */
export class AutomationRuntime {
  constructor(readonly database: Database) {}

  async expireExports() {
    return this.database.transaction(async (tx) => {
      const expired = await tx
        .select({ id: automationExport.id })
        .from(automationExport)
        .where(lt(automationExport.expiresAt, new Date()))
        .orderBy(automationExport.expiresAt, automationExport.id)
        .limit(100)
        .for("update", { skipLocked: true });
      if (expired.length)
        await tx.delete(automationExport).where(
          inArray(
            automationExport.id,
            expired.map((row) => row.id),
          ),
        );
      return { expired: expired.length };
    });
  }

  async execute<T>(
    context: AutomationContext,
    operation: string,
    input: ReceiptInput,
    output: z.ZodType<T>,
    authorize: (tx: Transaction) => Promise<unknown>,
    apply: (tx: Transaction) => Promise<unknown>,
  ): Promise<T> {
    const result = await this.perform(
      context,
      operation,
      input,
      output,
      authorize,
      apply,
    );
    if (!result.found)
      throw new Error("A completed mutation must have a receipt.");
    return result.value;
  }

  /** Recover before network/codec work, using exactly the same authority and fingerprint checks. */
  recover<T>(
    context: AutomationContext,
    operation: string,
    input: ReceiptInput,
    output: z.ZodType<T>,
    authorize: (tx: Transaction) => Promise<unknown>,
  ) {
    return this.perform(context, operation, input, output, authorize);
  }

  private async perform<T>(
    context: AutomationContext,
    operation: string,
    input: ReceiptInput,
    output: z.ZodType<T>,
    authorize: (tx: Transaction) => Promise<unknown>,
    apply?: (tx: Transaction) => Promise<unknown>,
  ): Promise<{ found: false } | { found: true; value: T }> {
    const { principal } = context;
    await reauthorizeContext(context);
    const fingerprint = createHash("sha256")
      .update(canonicalJson(input))
      .digest("hex");
    const result = await this.database.transaction(async (tx) => {
      await context.services.authorization.lock(
        principal.actor,
        "admin.access",
        tx,
      );
      const generation = await ContentGeneration.assertCurrent(
        principal.organizationId,
        input.expectedGeneration,
        tx,
      );
      await authorize(tx);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${principal.organizationId}:${principal.actor.userId}:${input.requestId}`}, 0))`,
      );
      const [previous] = await tx
        .select()
        .from(automationReceipt)
        .where(
          and(
            eq(automationReceipt.organizationId, principal.organizationId),
            eq(automationReceipt.actorUserId, principal.actor.userId),
            eq(automationReceipt.requestId, input.requestId),
          ),
        );
      if (previous) {
        if (
          previous.generation !== generation.generation ||
          previous.result === null
        )
          throw new DomainError(
            "AUTOMATION_REQUEST_RESET",
            "This request belongs to cleared club content. Start a new request after reading capabilities.",
            410,
          );
        if (
          previous.operation !== operation ||
          previous.inputHash !== fingerprint ||
          previous.connectionId !== principal.keyId
        )
          throw new DomainError(
            "AUTOMATION_REQUEST_CHANGED",
            "This request ID was used for different details or another connection. Retry the original request.",
            409,
          );
        return { found: true as const, value: output.parse(previous.result) };
      }
      if (!apply) return { found: false as const };
      const value = output.parse(await apply(tx));
      await tx.insert(automationReceipt).values({
        organizationId: principal.organizationId,
        actorUserId: principal.actor.userId,
        connectionId: principal.keyId,
        requestId: input.requestId,
        taskId: input.taskId,
        generation: generation.generation,
        operation,
        inputHash: fingerprint,
        result: value,
      });
      return { found: true as const, value };
    });
    await reauthorizeContext(context);
    return result;
  }
}

export function executeReceipt<T>(
  context: AutomationContext,
  operation: string,
  input: ReceiptInput,
  output: z.ZodType<T>,
  authorize: (tx: Transaction) => Promise<unknown>,
  apply: (tx: Transaction) => Promise<unknown>,
) {
  return context.services.automationRuntime.execute(
    context,
    operation,
    input,
    output,
    authorize,
    apply,
  );
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
