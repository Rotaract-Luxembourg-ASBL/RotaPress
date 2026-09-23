import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import { calendar } from "../../../db/schema/calendar";
import { calendarSource } from "../../../db/schema/calendar-sources";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
  type ResolveScheduledActor,
  type Transaction,
} from "@/core/authorization/AuthorizationService";
import type { Database } from "@/infrastructure/database/client";
import { CredentialCipher } from "@/infrastructure/security/CredentialCipher";
import { AuditRepository } from "@/core/audit/AuditRepository";
import {
  calendarImportAdapter,
  calendarImportProviders,
} from "./providers/adapters";
import {
  calendarFeedUrlSchema,
  type CalendarFeedTransport,
} from "./providers/CalendarFeedClient";
import {
  sourceCreateSchema,
  sourceOperationSchema,
  sourcePreviewSchema,
  type CalendarSourcesWorkspace,
} from "./calendar_source_schemas";

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export class CalendarSourceService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly auth: AuthorizationService,
    private readonly transport: CalendarFeedTransport,
    private readonly cipher: CredentialCipher,
    private readonly resolveActor: ResolveScheduledActor,
  ) {}
  private async scope(actor: TrustedActor, id: string, tx: Transaction) {
    const { organizationId: org } = await this.auth.lock(
      actor,
      "calendar.manage",
      tx,
    );
    const [parent] = await tx
      .select()
      .from(calendar)
      .where(
        and(
          eq(calendar.id, id),
          eq(calendar.organizationId, org),
          eq(calendar.archived, false),
        ),
      );
    if (!parent)
      throw new DomainError(
        "CALENDAR_NOT_FOUND",
        "Choose an active calendar.",
        404,
      );
    return org;
  }
  private prepare(
    provider: string,
    document: string,
    timezone: string,
    calendarId: string,
  ) {
    try {
      const adapter = calendarImportAdapter(provider);
      const normalized = adapter.normalize(document, timezone);
      if (Buffer.byteLength(normalized) > 524288) throw new Error();
      const now = Temporal.Now.plainDateISO("UTC");
      const items = adapter.occurrences(
        normalized,
        timezone,
        "preview",
        calendarId,
        {
          from: now.subtract({ days: 7 }).toString(),
          to: now.add({ days: 90 }).toString(),
          timezone,
          calendarIds: [calendarId],
        },
      );
      return {
        normalized,
        digest: digest(normalized),
        items: items.slice(0, 12),
        count: items.length,
      };
    } catch {
      throw new DomainError(
        "CALENDAR_IMPORT_INVALID",
        "This file could not be imported. Use an iCalendar file up to 512 KB with valid IANA time zones, at most 250 events and daily, weekly, monthly or yearly recurrence. Very large occurrence sets are not supported.",
        422,
      );
    }
  }
  async workspace(actor: TrustedActor): Promise<CalendarSourcesWorkspace> {
    const scope = await this.auth.require(actor, "calendar.manage");
    const rows = await this.db
      .select()
      .from(calendarSource)
      .where(eq(calendarSource.organizationId, scope.organizationId));
    return {
      providers: calendarImportProviders,
      remoteEnabled: this.transport.enabled,
      connectionAllowed: scope.capabilities.includes("integrations.manage"),
      items: rows.map((s) => ({
        id: s.id,
        calendarId: s.calendarId,
        name: s.name,
        provider: s.provider,
        timezone: s.timezone,
        version: s.version,
        enabled: s.enabled,
        automatic: s.automatic,
        connected: Boolean(s.endpoint),
        host: s.host,
        published: Boolean(s.published),
        changed: s.draft !== s.published,
        checkedAt: s.checkedAt?.toISOString() ?? null,
        error: s.lastError,
      })),
    };
  }
  async preview(actor: TrustedActor, raw: unknown) {
    const input = sourcePreviewSchema.parse(raw);
    await this.db.transaction((tx) => this.scope(actor, input.calendarId, tx));
    const { normalized: _, ...preview } = this.prepare(
      input.provider,
      input.document,
      input.timezone,
      input.calendarId,
    );
    void _;
    return preview;
  }
  async fetchPreview(actor: TrustedActor, raw: unknown) {
    const input = sourcePreviewSchema
      .omit({ document: true })
      .extend({ endpoint: calendarFeedUrlSchema })
      .parse(raw);
    await this.auth.require(actor, "integrations.manage");
    await this.db.transaction((tx) => this.scope(actor, input.calendarId, tx));
    if (!this.transport.enabled)
      throw new DomainError(
        "CALENDAR_REMOTE_DISABLED",
        "Remote feed requests are disabled in this installation. You can import an exported .ics file now.",
        409,
      );
    let document: string;
    try {
      document = await this.transport.read(input.endpoint);
    } catch {
      throw new DomainError(
        "CALENDAR_FEED_FAILED",
        "Could not read this HTTPS feed. Check its URL and access; redirects and private network addresses are not accepted.",
        422,
      );
    }
    const result = this.prepare(
      input.provider,
      document,
      input.timezone,
      input.calendarId,
    );
    return {
      document: result.normalized,
      digest: result.digest,
      items: result.items,
      count: result.count,
    };
  }
  async review(actor: TrustedActor, id: string) {
    z.uuid().parse(id);
    const { organizationId: org } = await this.auth.require(
      actor,
      "calendar.manage",
    );
    const [source] = await this.db
      .select()
      .from(calendarSource)
      .where(
        and(eq(calendarSource.id, id), eq(calendarSource.organizationId, org)),
      );
    if (!source)
      throw new DomainError(
        "CALENDAR_SOURCE_MISSING",
        "This import is unavailable.",
        404,
      );
    const result = this.prepare(
      source.provider,
      source.draft,
      source.timezone,
      source.calendarId,
    );
    return {
      version: source.version,
      digest: result.digest,
      items: result.items,
      count: result.count,
    };
  }
  async create(actor: TrustedActor, raw: unknown) {
    const input = sourceCreateSchema.parse(raw);
    await this.auth.require(actor, "calendar.manage");
    const result = this.prepare(
      input.provider,
      input.document,
      input.timezone,
      input.calendarId,
    );
    if (result.digest !== input.expectedDigest)
      throw new DomainError(
        "CALENDAR_IMPORT_CHANGED",
        "Review this import again before saving.",
        409,
      );
    const url = input.endpoint
      ? calendarFeedUrlSchema.parse(input.endpoint)
      : null;
    return this.db.transaction(async (tx) => {
      const org = await this.scope(actor, input.calendarId, tx);
      if (input.endpoint)
        await this.auth.require(actor, "integrations.manage", tx);
      const rows = await tx
        .select()
        .from(calendarSource)
        .where(
          and(
            eq(calendarSource.organizationId, org),
            eq(calendarSource.calendarId, input.calendarId),
          ),
        );
      const previous = rows.find((r) => r.id === input.id);
      if (previous) {
        if (
          previous.draft !== result.normalized ||
          previous.createdBy !== actor.userId ||
          previous.name !== input.name ||
          previous.provider !== input.provider ||
          previous.timezone !== input.timezone ||
          previous.automatic !== Boolean(url && input.automatic) ||
          (previous.endpoint
            ? this.cipher.open(previous.endpoint, org + ":calendar:" + input.id)
            : null) !== url
        )
          throw new DomainError(
            "CALENDAR_IMPORT_CONFLICT",
            "This import request was already used. Reload before creating another import.",
            409,
          );
        return { id: previous.id };
      }
      if (rows.length >= 5)
        throw new DomainError(
          "CALENDAR_SOURCE_LIMIT",
          "A calendar supports up to five imports or feed connections.",
          422,
        );
      await tx.insert(calendarSource).values({
        id: input.id,
        organizationId: org,
        calendarId: input.calendarId,
        provider: input.provider,
        name: input.name,
        timezone: input.timezone,
        draft: result.normalized,
        endpoint: url
          ? this.cipher.seal(url, org + ":calendar:" + input.id)
          : null,
        host: url ? new URL(url).hostname : null,
        automatic: Boolean(url && input.automatic),
        createdBy: actor.userId,
        sessionId: actor.sessionId,
        authorizedAt: new Date(),
      });
      await this.audit.record(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: "calendar.source.created",
        targetId: input.id,
      });
      return { id: input.id };
    });
  }
  async operation(actor: TrustedActor, raw: unknown) {
    const input = sourceOperationSchema.parse(raw);
    if (input.operation === "refresh")
      return this.refresh(actor, input.id, input.expectedVersion);
    return this.db.transaction(async (tx) => {
      const { organizationId: org } = await this.auth.lock(
        actor,
        "calendar.manage",
        tx,
      );
      const [s] = await tx
        .select()
        .from(calendarSource)
        .where(
          and(
            eq(calendarSource.id, input.id),
            eq(calendarSource.organizationId, org),
          ),
        );
      if (!s)
        throw new DomainError(
          "CALENDAR_SOURCE_MISSING",
          "This import is unavailable.",
          404,
        );
      if (s.version !== input.expectedVersion)
        throw new DomainError(
          "CALENDAR_SOURCE_CHANGED",
          "This import changed. Reload and review it again.",
          409,
        );
      if (input.operation === "remove")
        await tx.delete(calendarSource).where(eq(calendarSource.id, s.id));
      else {
        if (input.operation === "publish")
          await this.scope(actor, s.calendarId, tx);
        if (s.endpoint && input.operation === "resume")
          await this.auth.require(actor, "integrations.manage", tx);
        await tx
          .update(calendarSource)
          .set({
            version: s.version + 1,
            enabled: input.operation !== "pause",
            ...(input.operation === "publish" ? { published: s.draft } : {}),
            ...(input.operation === "resume"
              ? {
                  createdBy: actor.userId,
                  sessionId: actor.sessionId,
                  authorizedAt: new Date(),
                  nextSyncAt: new Date(),
                  lastError: null,
                }
              : {}),
          })
          .where(eq(calendarSource.id, s.id));
      }
      await this.audit.record(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: "calendar.source." + input.operation,
        targetId: s.id,
      });
      return { saved: true };
    });
  }
  async refresh(actor: TrustedActor, id: string, expectedVersion: number) {
    const { organizationId: org } = await this.auth.require(
      actor,
      "integrations.manage",
    );
    await this.auth.require(actor, "calendar.manage");
    const [source] = await this.db
      .select()
      .from(calendarSource)
      .where(
        and(eq(calendarSource.id, id), eq(calendarSource.organizationId, org)),
      );
    if (!source?.endpoint || !source.enabled)
      throw new DomainError(
        "CALENDAR_SOURCE_MISSING",
        "Resume a connected feed before refreshing it.",
        409,
      );
    if (source.version !== expectedVersion)
      throw new DomainError(
        "CALENDAR_SOURCE_CHANGED",
        "The connection changed. Reload before refreshing.",
        409,
      );
    await this.auth.features.requireQueuedWork(
      org,
      "calendar",
      source.authorizedAt,
      this.db,
    );
    if (!this.transport.enabled)
      throw new DomainError(
        "CALENDAR_REMOTE_DISABLED",
        "Remote feed requests are disabled in this installation.",
        409,
      );
    let document: string;
    try {
      document = await this.transport.read(
        this.cipher.open(source.endpoint, org + ":calendar:" + id),
      );
    } catch {
      throw new DomainError(
        "CALENDAR_FEED_FAILED",
        "Feed refresh failed. The last saved content is retained.",
        422,
      );
    }
    const result = this.prepare(
      source.provider,
      document,
      source.timezone,
      source.calendarId,
    );
    return this.db.transaction(async (tx) => {
      await this.scope(actor, source.calendarId, tx);
      await this.auth.require(actor, "integrations.manage", tx);
      await this.auth.features.requireQueuedWork(
        org,
        "calendar",
        source.authorizedAt,
        tx,
      );
      const [current] = await tx
        .select()
        .from(calendarSource)
        .where(
          and(
            eq(calendarSource.id, id),
            eq(calendarSource.organizationId, org),
          ),
        );
      if (!current || !current.enabled || current.version !== expectedVersion)
        throw new DomainError(
          "CALENDAR_SOURCE_CHANGED",
          "The connection changed during refresh. No content was replaced.",
          409,
        );
      await tx
        .update(calendarSource)
        .set({
          draft: result.normalized,
          published:
            current.automatic && current.published
              ? result.normalized
              : current.published,
          version: current.version + 1,
          checkedAt: new Date(),
          nextSyncAt: new Date(Date.now() + 3600000),
          lastError: null,
        })
        .where(eq(calendarSource.id, id));
      await this.audit.record(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: "calendar.source.refreshed",
        targetId: id,
      });
      return { saved: true };
    });
  }
  async runBatch() {
    if (!this.transport.enabled) return { checked: 0, refreshed: 0 };
    const rows = await this.db
      .select()
      .from(calendarSource)
      .where(
        and(
          eq(calendarSource.enabled, true),
          isNotNull(calendarSource.endpoint),
          lte(calendarSource.nextSyncAt, new Date()),
        ),
      )
      .orderBy(calendarSource.nextSyncAt)
      .limit(3);
    let refreshed = 0;
    for (const s of rows) {
      const claimed = await this.db
        .update(calendarSource)
        .set({ nextSyncAt: new Date(Date.now() + 3600000) })
        .where(
          and(
            eq(calendarSource.id, s.id),
            eq(calendarSource.version, s.version),
            lte(calendarSource.nextSyncAt, new Date()),
          ),
        )
        .returning({ id: calendarSource.id });
      if (!claimed.length) continue;
      try {
        const identity = await this.resolveActor(s.sessionId, s.createdBy);
        if (!identity || identity.expiresAt <= new Date())
          throw new Error("SESSION_EXPIRED");
        await this.refresh(identity.actor, s.id, s.version);
        refreshed++;
      } catch {
        await this.db
          .update(calendarSource)
          .set({
            lastError:
              "Sync paused or unavailable. Check the connection and use Resume sync with a current staff session.",
          })
          .where(
            and(
              eq(calendarSource.id, s.id),
              eq(calendarSource.version, s.version),
            ),
          );
      }
    }
    return { checked: rows.length, refreshed };
  }
}
