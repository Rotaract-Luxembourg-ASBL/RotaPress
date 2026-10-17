import { z } from "zod";

export const operationEffectSchema = z.enum([
  "read",
  "draft",
  "publish",
  "archive",
  "update",
  "delete",
  "export",
  "access",
  "communicate",
]);
export type OperationEffect = z.infer<typeof operationEffectSchema>;
export const operationEffectLabels: Record<OperationEffect, string> = {
  read: "Reads authorized information or returns instructions without changing content.",
  draft: "Saves private draft content. The public version does not change.",
  publish: "Publishes the requested saved content to its configured audience.",
  archive:
    "Archives the selected content. Public availability may change; saved history is retained.",
  update: "Updates the requested operational records immediately.",
  delete: "Permanently deletes the exact requested records.",
  export: "Exports the selected private data for this authorized connection.",
  access: "Changes the requested account, membership or event access.",
  communicate:
    "Queues the requested communication for delivery to its configured recipients.",
};
