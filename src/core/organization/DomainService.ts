import "server-only";
import { randomBytes } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { and, eq } from "drizzle-orm";
import { siteDomain } from "../../../db/schema/domains";
import { clubEvent } from "../../../db/schema/events";
import { AuditRepository } from "../audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
} from "../authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import {
  addDomainSchema,
  domainActionSchema,
  type DomainWorkspace,
} from "./domain_schemas";

async function lookupTxt(hostname: string): Promise<string[][]> {
  const resolver = new Resolver({ timeout: 3000, tries: 1 });
  return resolver.resolveTxt(hostname);
}

/** Ownership setup only. Host routing, TLS and trusted origins remain deployment configuration. */
export class DomainService {
  private readonly origin: string;
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    appUrl: string,
    private readonly resolveTxt: (
      name: string,
    ) => Promise<string[][]> = lookupTxt,
  ) {
    this.origin = new URL(appUrl).origin;
  }
  async workspace(actor: TrustedActor): Promise<DomainWorkspace> {
    const scope = await this.authorization.require(actor, "settings.manage");
    const rows = await this.db
      .select({
        domain: siteDomain,
        eventTitle: clubEvent.title,
        eventSlug: clubEvent.slug,
      })
      .from(siteDomain)
      .leftJoin(
        clubEvent,
        and(
          eq(clubEvent.id, siteDomain.eventId),
          eq(clubEvent.organizationId, siteDomain.organizationId),
        ),
      )
      .where(eq(siteDomain.organizationId, scope.organizationId))
      .orderBy(siteDomain.createdAt);
    return {
      origin: this.origin,
      callbackUrl: `${this.origin}/api/auth/callback/google`,
      canManage: scope.capabilities.includes("ownership.manage"),
      items: rows.map(({ domain: row, eventTitle, eventSlug }) => ({
        id: row.id,
        hostname: row.hostname,
        recordName: `_rotapress.${row.hostname}`,
        recordValue: `rotapress-domain=${row.challenge}`,
        verifiedAt: row.verifiedAt?.toISOString() ?? null,
        active: new URL(this.origin).hostname === row.hostname,
        eventId: row.eventId,
        eventTitle,
        destinationUrl:
          row.eventId && eventSlug
            ? `${this.origin}/events/${eventSlug}/en/website`
            : this.origin,
      })),
    };
  }
  async add(actor: TrustedActor, input: unknown) {
    const values = addDomainSchema.parse(input);
    await this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(
        actor,
        "ownership.manage",
        tx,
      );
      if (values.eventId) {
        const [event] = await tx
          .select({ id: clubEvent.id, archivedAt: clubEvent.archivedAt })
          .from(clubEvent)
          .where(
            and(
              eq(clubEvent.id, values.eventId),
              eq(clubEvent.organizationId, scope.organizationId),
            ),
          );
        if (!event || event.archivedAt)
          throw new DomainError(
            "EVENT_NOT_FOUND",
            "Choose an available event from this club.",
            404,
          );
        if (new URL(this.origin).hostname === values.hostname)
          throw new DomainError(
            "ACTIVE_DOMAIN",
            "Use a separate subdomain for an event. This address already hosts the club application.",
            422,
          );
      }
      const rows = await tx
        .select({ id: siteDomain.id })
        .from(siteDomain)
        .where(eq(siteDomain.organizationId, scope.organizationId));
      if (rows.length >= 10)
        throw new DomainError(
          "DOMAIN_LIMIT",
          "Keep up to ten domain setup records.",
          422,
        );
      const [created] = await tx
        .insert(siteDomain)
        .values({
          organizationId: scope.organizationId,
          hostname: values.hostname,
          eventId: values.eventId,
          challenge: randomBytes(24).toString("hex"),
        })
        .onConflictDoNothing()
        .returning({ id: siteDomain.id });
      if (!created)
        throw new DomainError(
          "DOMAIN_EXISTS",
          "This domain is already in setup.",
          409,
        );
      await new AuditRepository().record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "domain.added",
        targetId: created.id,
      });
    });
    return this.workspace(actor);
  }
  async change(actor: TrustedActor, input: unknown) {
    const values = domainActionSchema.parse(input);
    const row = await this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(
        actor,
        "ownership.manage",
        tx,
      );
      const [row] = await tx
        .select()
        .from(siteDomain)
        .where(
          and(
            eq(siteDomain.id, values.id),
            eq(siteDomain.organizationId, scope.organizationId),
          ),
        );
      if (!row)
        throw new DomainError(
          "DOMAIN_NOT_FOUND",
          "This domain is unavailable.",
          404,
        );
      if (values.operation === "remove") {
        if (new URL(this.origin).hostname === row.hostname)
          throw new DomainError(
            "ACTIVE_DOMAIN",
            "Change the hosting configuration before removing the active domain.",
            409,
          );
        await tx.delete(siteDomain).where(eq(siteDomain.id, row.id));
        await new AuditRepository().record(tx, {
          organizationId: scope.organizationId,
          actorUserId: actor.userId,
          action: "domain.removed",
          targetId: row.id,
        });
      } else {
        if (
          row.lastCheckedAt &&
          Date.now() - row.lastCheckedAt.getTime() < 60000
        )
          throw new DomainError(
            "DOMAIN_CHECK_LIMIT",
            "Wait one minute before checking DNS again.",
            429,
          );
        await tx
          .update(siteDomain)
          .set({ lastCheckedAt: new Date() })
          .where(eq(siteDomain.id, row.id));
      }
      return row;
    });
    if (values.operation === "verify") {
      let matches = false;
      try {
        const records = await this.resolveTxt(`_rotapress.${row.hostname}`);
        matches = records.some(
          (parts) => parts.join("") === `rotapress-domain=${row.challenge}`,
        );
      } catch {
        /* Missing, timed-out or failed DNS is never treated as proof. */
      }
      await this.db.transaction(async (tx) => {
        const scope = await this.authorization.lock(
          actor,
          "ownership.manage",
          tx,
        );
        const [updated] = await tx
          .update(siteDomain)
          .set({ verifiedAt: matches ? new Date() : null })
          .where(
            and(
              eq(siteDomain.id, row.id),
              eq(siteDomain.organizationId, scope.organizationId),
              eq(siteDomain.challenge, row.challenge),
            ),
          )
          .returning({ id: siteDomain.id });
        if (!updated)
          throw new DomainError(
            "DOMAIN_CHANGED",
            "The domain setup changed. Reload the panel.",
            409,
          );
        await new AuditRepository().record(tx, {
          organizationId: scope.organizationId,
          actorUserId: actor.userId,
          action: matches ? "domain.verified" : "domain.verification_failed",
          targetId: row.id,
        });
      });
      if (!matches)
        throw new DomainError(
          "DNS_NOT_VERIFIED",
          "The expected TXT record was not found. Check the value and allow time for DNS propagation.",
          422,
        );
    }
    return this.workspace(actor);
  }
}
