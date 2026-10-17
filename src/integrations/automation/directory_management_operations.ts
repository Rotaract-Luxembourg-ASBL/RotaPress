import { z } from "zod";
import { directoryMutationOutput } from "./response_schemas";
import { receiptOperation } from "./receipt_operation";
import { requireReceiptCapability } from "./receipt_authority";
import { exampleId } from "./examples";

export const directoryManagementOperations = (
  ["unpublish", "restore"] as const
).map((action) =>
  receiptOperation(
    {
      name: `directory_${action}`,
      method: "POST",
      path: `/directory/{id}/${action}`,
      scope: "directory:manage",
      effect: action === "restore" ? "draft" : "archive",
      description:
        action === "restore"
          ? "Restore the previous publication into an editable draft using current version. The public version remains unchanged."
          : "Unpublish the requested profile using current version. Retained explicit published references block removal; other profiles are unaffected.",
      input: z.strictObject({
        id: z.uuid(),
        expectedVersion: z.int().positive(),
        confirmed: z.literal(true),
      }),
      output: directoryMutationOutput,
      example: { id: exampleId, expectedVersion: 1, confirmed: true },
    },
    requireReceiptCapability("cms.publish"),
    async ({ services, principal }, { id, expectedVersion }, tx) =>
      directoryMutationOutput
        .strip()
        .parse(
          await services.partners.change(
            principal.actor,
            id,
            action,
            action === "restore"
              ? { expectedVersion }
              : { expectedVersion, confirmed: true },
            tx,
          ),
        ),
  ),
);
