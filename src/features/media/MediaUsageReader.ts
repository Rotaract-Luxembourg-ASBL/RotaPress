import "server-only";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import { MediaUsageRepository } from "./MediaUsageRepository";
import type { MediaUsageAccess, MediaUsageQuery } from "./media_usage";

/** Apply current staff, feature and delegated authority before counting destinations. */
export class MediaUsageReader {
  constructor(private readonly authorization: AuthorizationService) {}
  async destinations(
    actor: TrustedActor,
    organizationId: string,
    assetId: string,
    input: MediaUsageQuery,
    tx: DatabaseExecutor,
    delegated?: MediaUsageAccess,
  ) {
    const allowed = async (check: () => Promise<unknown>) => {
      try {
        await check();
        return true;
      } catch (error) {
        if (error instanceof DomainError) return false;
        throw error;
      }
    };
    const scope = await this.authorization.approved(actor, tx);
    const cms = await allowed(() =>
      this.authorization.require(actor, "cms.edit", tx),
    );
    const events =
      cms &&
      (await allowed(() =>
        this.authorization.features.require(organizationId, "events", tx),
      )) &&
      (!delegated ||
        (await allowed(() =>
          this.authorization.require(actor, "events.create", tx),
        )));
    const projects =
      cms &&
      (await allowed(() =>
        this.authorization.features.require(organizationId, "projects", tx),
      ));
    return new MediaUsageRepository().page(
      tx,
      organizationId,
      actor.userId,
      assetId,
      input,
      {
        albums: delegated?.albums ?? true,
        website: cms && (delegated?.website ?? true),
        events: events && (delegated?.events ?? true),
        projects: projects && (delegated?.projects ?? true),
        directory: cms && (delegated?.directory ?? true),
        managesEvents: scope.capabilities.includes("events.manage"),
      },
    );
  }
}
