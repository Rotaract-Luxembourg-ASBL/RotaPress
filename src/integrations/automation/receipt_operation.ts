import { z } from "zod";
import type { Transaction } from "@/core/authorization/AuthorizationService";
import { operation, type AutomationContext, type Operation } from "./operation";
import { executeReceipt, receiptFields } from "./receipt_service";
import { exampleId } from "./examples";
const receiptSchema = z.object(receiptFields);

/** Adapts a native transaction-aware mutation without a second persistence path. */
export function receiptOperation<I extends z.ZodObject>(
  definition: Omit<Operation, "input" | "run" | "readOnly"> & { input: I },
  authorize: (
    context: AutomationContext,
    input: z.output<I>,
    tx: Transaction,
  ) => Promise<unknown>,
  run: (
    context: AutomationContext,
    input: z.output<I>,
    tx: Transaction,
  ) => Promise<unknown>,
) {
  return operation(
    {
      ...definition,
      input: definition.input.safeExtend(receiptFields),
      description: `${definition.description} Reuse the same requestId and unchanged payload after interruption to recover the committed result.`,
      example: { ...definition.example, requestId: exampleId },
    },
    (context, envelope) => {
      const receipt = receiptSchema.parse(envelope);
      const nativeInput = { ...envelope };
      for (const key of Object.keys(receiptFields))
        if (!(key in definition.input.shape)) delete nativeInput[key];
      const input = definition.input.parse(nativeInput) as z.output<I>;
      return executeReceipt(
        context,
        definition.name,
        { ...input, ...receipt },
        definition.output,
        (tx) => authorize(context, input, tx),
        (tx) => run(context, input, tx),
      );
    },
  );
}
