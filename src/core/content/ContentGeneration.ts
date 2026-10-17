import "server-only";
import { eq } from "drizzle-orm";
import { contentGeneration } from "../../../db/schema/content-generation";
import { installation } from "../../../db/schema/club";
import type { DatabaseExecutor } from "../authorization/AuthorizationService";
import { DomainError } from "../DomainError";

export class ContentGeneration {
  static async read(organizationId: string, executor: DatabaseExecutor) {
    const [state] = await executor
      .select({
        generation: contentGeneration.generation,
        resetAt: contentGeneration.resetAt,
      })
      .from(contentGeneration)
      .where(eq(contentGeneration.organizationId, organizationId));
    if (!state)
      throw new DomainError(
        "CONTENT_GENERATION_UNAVAILABLE",
        "The website is being prepared. Reload before making changes.",
        409,
      );
    return state;
  }

  static async installed(executor: DatabaseExecutor) {
    const [state] = await executor
      .select({ organizationId: installation.organizationId })
      .from(installation)
      .where(eq(installation.id, 1));
    return state?.organizationId
      ? {
          organizationId: state.organizationId,
          ...(await this.read(state.organizationId, executor)),
        }
      : null;
  }

  static async assertCurrent(
    organizationId: string,
    expectedGeneration: string | undefined,
    executor: DatabaseExecutor,
  ) {
    const state = await this.read(organizationId, executor);
    if (
      (expectedGeneration !== undefined &&
        expectedGeneration !== state.generation) ||
      (state.resetAt && !expectedGeneration)
    ) {
      throw new DomainError(
        "CONTENT_RESET",
        "The club content has been reset. Reload the workspace and start a new request; the old request was not applied.",
        409,
      );
    }
    return state;
  }
}
