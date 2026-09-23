import "server-only";
import { createHash, randomInt } from "node:crypto";
import type { DrawAward, DrawSnapshot } from "./draw_schemas";

export const drawDigest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Each remaining ticket has equal probability; no modulo or floating-point RNG. */
export function selectDrawAwards(
  snapshot: DrawSnapshot,
  nextInteger: (upperExclusive: number) => number = randomInt,
): DrawAward[] {
  const pool = snapshot.candidates.map((candidate) => ({
    ...candidate,
    remaining: candidate.quantity,
    used: new Set<number>(),
  }));
  return snapshot.slots.map((slot) => {
    const total = pool.reduce((sum, item) => sum + item.remaining, 0);
    if (total < 1) throw new Error("The frozen draw has insufficient entries.");
    let rank = nextInteger(total);
    if (!Number.isSafeInteger(rank) || rank < 0 || rank >= total)
      throw new Error("Invalid random selection.");
    const chosen = pool.find((item) => {
      if (rank < item.remaining) return true;
      rank -= item.remaining;
      return false;
    })!;
    // Translate a rank among remaining tickets to its original frozen ticket number.
    let ticket = rank + 1;
    for (const used of [...chosen.used].sort((a, b) => a - b)) {
      if (used <= ticket) ticket += 1;
    }
    chosen.used.add(ticket);
    chosen.remaining -= 1;
    if (!snapshot.rules.repeatWinners) {
      for (const item of pool) {
        if (item.participantKey === chosen.participantKey) item.remaining = 0;
      }
    }
    return {
      prizeId: slot.prizeId,
      unit: slot.unit,
      entryId: chosen.entryId,
      ticket,
    };
  });
}
