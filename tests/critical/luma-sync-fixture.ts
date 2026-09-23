import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { and, eq } from "drizzle-orm";
import { clubEvent } from "../../db/schema/events";
import { lumaApiEvent } from "../../db/schema/luma-sync";
import type {
  AuthorizationService,
  TrustedActor,
  StaffAccess,
  ResolveScheduledActor,
} from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import { EventService } from "../../src/features/events/EventService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { RegistrationService } from "../../src/features/events/RegistrationService";
import { FormService } from "../../src/features/forms/FormService";
import { MembershipService } from "../../src/features/members/MembershipService";
import { LumaAvailabilityService } from "../../src/integrations/luma/LumaAvailabilityService";
import { EventLumaLinkService } from "../../src/integrations/luma/EventLumaLinkService";
import { LumaConnectionService } from "../../src/integrations/luma/LumaConnectionService";
import { LumaConnectionAccess } from "../../src/integrations/luma/LumaConnectionAccess";
import { LumaEventSyncAccess } from "../../src/integrations/luma/LumaEventSyncAccess";
import { LumaApiEventService } from "../../src/integrations/luma/LumaApiEventService";
import { LumaGuestSyncService } from "../../src/integrations/luma/LumaGuestSyncService";
import { LumaClient } from "../../src/integrations/luma/LumaClient";
import { CredentialCipher } from "../../src/integrations/luma/CredentialCipher";
import { LumaReconciliationJobs } from "../../src/integrations/luma/LumaReconciliationJobs";
import { LumaReconciliationRunner } from "../../src/integrations/luma/LumaReconciliationRunner";

export type Context = {
  db: Database;
  authorization: AuthorizationService;
  events: EventService;
  club: () => Promise<{
    owner: TrustedActor;
    manager: TrustedActor;
    scope: StaffAccess;
  }>;
  actor: (label: string) => Promise<TrustedActor>;
};
export const destination = "https://luma.com/synthetic-sync-event";
export const confirm = (version: number) => ({
  expectedVersion: version,
  confirmed: true,
});
export const syntheticKey = () =>
  `synthetic-${randomBytes(24).toString("hex")}`;
export const guest = (id: string, status = "approved") => ({
  id,
  user_name: `Synthetic ${id}`,
  user_email: `${id}@example.test`,
  approval_status: status,
  event_tickets: [{ id: `ticket-${id}` }],
  check_in_qr_code: "synthetic-excluded",
  registration_answers: [{ value: "synthetic-excluded" }],
});
export async function fixture() {
  let mode = "normal",
    calls = 0;
  const sources = new Map<string, { url: string; mode: string }>();
  const eventCalls = new Map<string, number>();
  const details = new Map<string, unknown>();
  let detailCalls = 0;
  let detailFailure = false;
  let onPage: ((res: ServerResponse) => void) | undefined;
  let onDetail: ((res: ServerResponse) => void) | undefined;
  const server = createServer((request, response) => {
    calls++;
    const url = new URL(request.url!, "http://127.0.0.1");
    const providerEventId = url.searchParams.get("event_id") ?? "";
    if (providerEventId)
      eventCalls.set(
        providerEventId,
        (eventCalls.get(providerEventId) ?? 0) + 1,
      );
    const source = sources.get(providerEventId);
    const requestMode = source?.mode ?? mode;
    response.setHeader("content-type", "application/json");
    if (
      !request.headers["x-luma-api-key"]?.toString().startsWith("synthetic-")
    ) {
      response.writeHead(401).end();
      return;
    }
    if (url.pathname === "/v1/calendars/get") {
      response.end(JSON.stringify({ id: "cal-sync" }));
      return;
    }
    if (url.pathname === "/v1/events/get") {
      response.end(
        JSON.stringify({
          id: url.searchParams.get("event_id"),
          calendar_id: requestMode === "calendar" ? "cal-other" : "cal-sync",
          access: requestMode === "view" ? "view" : "manage",
          url:
            requestMode === "url"
              ? "https://luma.com/other-event"
              : (source?.url ?? destination),
        }),
      );
      return;
    }
    if (url.pathname === "/v1/events/guests/get") {
      detailCalls++;
      if (onDetail) {
        onDetail(response);
        return;
      }
      if (detailFailure) {
        response.writeHead(503).end("synthetic detail error excluded");
        return;
      }
      const detail = details.get(
        `${providerEventId}:${url.searchParams.get("id")}`,
      );
      if (!detail) response.writeHead(404).end();
      else response.end(JSON.stringify(detail));
      return;
    }
    if (url.pathname !== "/v1/events/guests/list") {
      response.writeHead(404).end();
      return;
    }
    if (onPage) {
      onPage(response);
      return;
    }
    const cursor = url.searchParams.get("pagination_cursor");
    if (requestMode === "failure" && cursor) {
      response.writeHead(503).end("synthetic private error excluded");
      return;
    }
    if (requestMode === "missing") {
      response.end(
        JSON.stringify({
          entries: [guest("gst-one", "declined")],
          has_more: false,
        }),
      );
      return;
    }
    if (requestMode === "cycle") {
      response.end(
        JSON.stringify({ entries: [], has_more: true, next_cursor: "repeat" }),
      );
      return;
    }
    if (requestMode === "malformed") {
      response.end(
        JSON.stringify({
          entries: [{ ...guest("gst-one"), user_email: "invalid" }],
          has_more: false,
        }),
      );
      return;
    }
    if (requestMode === "large") {
      const page = Number(cursor ?? "0");
      response.end(
        JSON.stringify({
          entries: Array.from({ length: 100 }, (_, i) =>
            guest(`gst-${page * 100 + i}`),
          ),
          has_more: true,
          next_cursor: String(page + 1),
        }),
      );
      return;
    }
    response.end(
      JSON.stringify({
        entries: cursor
          ? [guest("gst-one"), guest("gst-two")]
          : [guest("gst-one")],
        has_more: !cursor,
        ...(cursor ? {} : { next_cursor: "page-two" }),
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture unavailable");
  return {
    client: new LumaClient({
      mode: "fixture",
      origin: `http://127.0.0.1:${address.port}`,
    }),
    source: (id: string, url: string) => {
      sources.set(id, { url, mode: "normal" });
    },
    mode: (value: string, providerEventId?: string) => {
      if (!providerEventId) mode = value;
      else {
        const current = sources.get(providerEventId);
        sources.set(providerEventId, {
          url: current?.url ?? destination,
          mode: value,
        });
      }
    },
    calls: (providerEventId?: string) =>
      providerEventId ? (eventCalls.get(providerEventId) ?? 0) : calls,
    hold: (callback?: typeof onPage) => {
      onPage = callback;
    },
    detail: (
      value: unknown,
      providerEventId = "evt-sync",
      guestId = "gst-one",
    ) => {
      details.set(`${providerEventId}:${guestId}`, value);
    },
    detailCalls: () => detailCalls,
    failDetail: (value: boolean) => {
      detailFailure = value;
    },
    holdDetail: (callback?: typeof onDetail) => {
      onDetail = callback;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export async function setup(context: Context, client: LumaClient) {
  const { db, events, authorization, club } = context;
  const people = await club();
  let sessionActive = true;
  const resolveActor: ResolveScheduledActor = async (sessionId, userId) =>
    sessionActive
      ? {
          actor: { ...people.manager, sessionId, userId },
          expiresAt: new Date(Date.now() + 60_000),
        }
      : null;
  const modules = new EventModuleService(db, events);
  const forms = new FormService(db, authorization);
  const registrations = new RegistrationService(
    db,
    authorization,
    new MembershipService(db, authorization, forms),
  );
  const availability = new LumaAvailabilityService(db, authorization);
  const cipher = new CredentialCipher(randomBytes(32).toString("hex"));
  const connection = new LumaConnectionService(
    db,
    authorization,
    availability,
    cipher,
    client,
  );
  const access = new LumaEventSyncAccess(
    authorization,
    events,
    modules,
    registrations,
  );
  const connectionAccess = new LumaConnectionAccess(
    availability,
    cipher,
    client.mode,
  );
  const api = new LumaApiEventService(
    db,
    events,
    access,
    connectionAccess,
    client,
  );
  const sync = new LumaGuestSyncService(
    db,
    events,
    access,
    connectionAccess,
    client,
    resolveActor,
  );
  const links = new EventLumaLinkService(
    db,
    authorization,
    events,
    modules,
    registrations,
    availability,
  );
  const fields = {
    title: "Synthetic sync event",
    description: "Local copy is authoritative",
    startsAt: "2026-12-15T10:00:00Z",
    endsAt: null,
    timezone: "Europe/Paris",
    venue: "Synthetic venue",
    visibility: "private" as const,
    managerUserId: people.manager.userId,
  };
  let event = await events.create(people.owner, fields);
  for (const key of ["website", "registration"] as const)
    event = await modules.change(people.manager, {
      id: event.id,
      ...confirm(event.version),
      key,
      operation: "enable",
      suspendDependents: false,
    });
  await availability.configure(people.owner, {
    ...confirm(0),
    enabled: true,
  });
  const saved = await connection.save(people.owner, {
    ...confirm(0),
    apiKey: syntheticKey(),
  });
  await connection.check(people.owner, confirm(saved.version));
  await links.save(people.manager, event.id, {
    expectedVersion: 0,
    url: destination,
  });
  await links.publication(people.manager, event.id, {
    ...confirm(1),
    expectedRegistrationVersion: 0,
    operation: "publish",
  });
  // Explicit synthetic published event fixture; no session/authentication bypass.
  await db
    .update(clubEvent)
    .set({ publishedAt: new Date(), published: fields })
    .where(eq(clubEvent.id, event.id));
  const link = (
    actor = people.manager,
    providerEventId = "evt-sync",
    sourceId?: string,
  ) =>
    api.link(actor, event.id, {
      ...confirm(0),
      providerEventId,
      ...(sourceId ? { sourceId } : {}),
    });
  const reconcile = async (
    requestId = randomUUID(),
    actor = people.manager,
    sourceId?: string,
  ) => {
    const current = await api.workspace(actor, event.id, sourceId);
    const input = {
      ...confirm(current.version),
      requestId,
      ...(sourceId ? { sourceId } : {}),
    };
    return { input, runs: await sync.reconcile(actor, event.id, input) };
  };
  const elapsed = async (sourceId?: string) => {
    const selectedSource =
      sourceId ?? (await api.workspace(people.manager, event.id)).sourceId;
    if (!selectedSource) throw new Error("Synthetic API source is missing.");
    await db
      .update(lumaApiEvent)
      .set({ attemptedAt: new Date(Date.now() - 61_000) })
      .where(
        and(
          eq(lumaApiEvent.eventId, event.id),
          eq(lumaApiEvent.sourceId, selectedSource),
        ),
      );
  };
  return {
    ...people,
    jobs: new LumaReconciliationJobs(
      db,
      events,
      access,
      connectionAccess,
      resolveActor,
    ),
    runner: () =>
      new LumaReconciliationRunner(
        db,
        new LumaReconciliationJobs(
          db,
          events,
          access,
          connectionAccess,
          resolveActor,
        ),
        sync,
      ),
    revokeSession: () => {
      sessionActive = false;
    },
    db,
    events,
    modules,
    registrations,
    availability,
    connection,
    access,
    connectionAccess,
    resolveActor,
    api,
    sync,
    links,
    event,
    fields,
    link,
    reconcile,
    elapsed,
  };
}
