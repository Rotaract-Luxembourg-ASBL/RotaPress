import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { eventPackageSource } from "../../../db/schema/event-packages";
import { lumaEventLink } from "../../../db/schema/integrations";
import {
  DomainError,
  type DatabaseExecutor,
} from "../../core/authorization/AuthorizationService";

/** Explicit source selection; old clients address only the retained registration destination. */
export class LumaSourceAccess {
  async list(org: string, eventId: string, db: DatabaseExecutor) {
    return db
      .select({
        id: eventPackageSource.id,
        label: eventPackageSource.label,
        url: eventPackageSource.url,
        enabled: eventPackageSource.enabled,
        version: eventPackageSource.version,
      })
      .from(eventPackageSource)
      .where(
        and(
          eq(eventPackageSource.organizationId, org),
          eq(eventPackageSource.eventId, eventId),
        ),
      )
      .orderBy(asc(eventPackageSource.label), asc(eventPackageSource.id));
  }
  async selection(
    org: string,
    eventId: string,
    db: DatabaseExecutor,
    sourceId?: string,
  ) {
    if (sourceId !== undefined) z.uuid().parse(sourceId);
    const sources = await this.list(org, eventId, db);
    if (sourceId !== undefined) {
      const source = sources.find((s) => s.id === sourceId);
      if (!source)
        throw new DomainError(
          "LUMA_SOURCE_NOT_FOUND",
          "This booking source is unavailable for this event.",
          404,
        );
      return source;
    }
    const [link] = await db
      .select({ url: lumaEventLink.publishedUrl })
      .from(lumaEventLink)
      .where(
        and(
          eq(lumaEventLink.organizationId, org),
          eq(lumaEventLink.eventId, eventId),
        ),
      );
    const legacyUrl = link?.url?.replace("https://lu.ma/", "https://luma.com/");
    return sources.find((s) => s.url === legacyUrl);
  }
}
