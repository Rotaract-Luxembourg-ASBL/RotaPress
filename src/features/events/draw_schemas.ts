import { z } from "zod";

const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        [...value].every(
          (character) =>
            character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        ),
      "Use a single line without control characters.",
    );
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const drawRulesSchema = z.strictObject({
  version: z.literal(1),
  purpose: z.string().trim().min(10).max(1000),
  selection: z.literal("weighted_entries_without_replacement"),
  repeatWinners: z.boolean(),
});
export const drawCandidateSchema = z.strictObject({
  entryId: z.uuid(),
  participantKey: z.string().max(80),
  label: line(100),
  version: z.number().int().positive(),
  quantity: z.number().int().min(1).max(10000),
  evidenceKey: digest,
});
export const drawSlotSchema = z.strictObject({
  prizeId: z.uuid(),
  revisionId: z.uuid(),
  title: line(160),
  unit: z.number().int().min(1).max(10000),
});
export const drawSnapshotSchema = z.strictObject({
  version: z.literal(1),
  mode: z.literal("demo"),
  title: line(100),
  rules: drawRulesSchema,
  candidates: z.array(drawCandidateSchema).min(1).max(200),
  slots: z.array(drawSlotSchema).min(1).max(20),
});
export const drawAwardsSchema = z
  .array(
    z.strictObject({
      prizeId: z.uuid(),
      unit: z.number().int().positive(),
      entryId: z.uuid(),
      ticket: z.number().int().min(1).max(10000),
    }),
  )
  .min(1)
  .max(20);
export const winnerNamesSchema = z
  .array(
    z.strictObject({
      prizeId: z.uuid(),
      unit: z.number().int().positive(),
      displayName: line(80),
    }),
  )
  .max(20);
export const publicWinnersSchema = z
  .array(
    z.strictObject({
      prizeId: z.uuid(),
      revisionId: z.uuid(),
      prizeTitle: line(160),
      unit: z.number().int().positive(),
      displayName: line(80),
    }),
  )
  .max(20);
export const freezeDrawSchema = z.strictObject({
  mode: z.literal("demo"),
  requestId: z.uuid(),
  expectedPreparationKey: digest,
  title: line(100),
  rules: drawRulesSchema,
  prizes: z
    .array(
      z.strictObject({
        prizeId: z.uuid(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(20),
  confirmed: z.literal(true),
});
export const runDrawSchema = z.strictObject({
  mode: z.literal("demo"),
  expectedDigest: digest,
  confirmed: z.literal(true),
});
export const reviewDrawSchema = z.strictObject({
  mode: z.literal("demo"),
  requestId: z.uuid(),
  expectedVersion: z.number().int().min(0),
  operation: z.enum(["cancel", "publish", "unpublish"]),
  reason: z.string().trim().min(5).max(1000),
  winners: winnerNamesSchema.default([]),
  confirmed: z.literal(true),
});
export type DrawSnapshot = z.infer<typeof drawSnapshotSchema>;
export type DrawCandidate = z.infer<typeof drawCandidateSchema>;
export type DrawAward = z.infer<typeof drawAwardsSchema>[number];
export type FreezeDraw = z.infer<typeof freezeDrawSchema>;
export type PublicWinner = { prizeTitle: string; displayName: string };
export type DrawRecord = {
  id: string;
  snapshot: DrawSnapshot;
  digest: string;
  createdAt: string;
  createdBy: string;
  state: "frozen" | "drawn" | "cancelled";
  version: number;
  issue: string | null;
  result: {
    awards: DrawAward[];
    digest: string;
    createdAt: string;
    createdBy: string;
  } | null;
  published: z.infer<typeof publicWinnersSchema>;
  history: {
    version: number;
    operation: string;
    reason: string;
    createdAt: string;
    createdBy: string;
  }[];
};
export type DrawPreparation = {
  key: string;
  candidates: DrawCandidate[];
  excludedRecords: number;
  prizes: {
    id: string;
    revisionId: string;
    title: string;
    availableUnits: number[];
  }[];
};
export type DrawWorkspace = {
  canManage: boolean;
  canPublish: boolean;
  unavailableReason: string | null;
  preparation: DrawPreparation;
  items: DrawRecord[];
};
