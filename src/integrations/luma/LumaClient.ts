import "server-only";
import { z } from "zod";
import type { ConnectionCode, ConnectionMode } from "./connection_schemas";
import {
  providerEventSchema,
  providerGuestPageSchema,
  type ImportedGuest,
} from "./sync_schemas";
import {
  providerPurchaseDetailsSchema,
  type ImportedPurchaseDetails,
} from "./purchase_schemas";

export class LumaRequestError extends Error {
  constructor(readonly code: ConnectionCode) {
    super(code);
  }
}
const calendar = z.object({
  id: z.string().regex(/^cal-[a-zA-Z0-9_-]{1,100}$/),
});
type Destination =
  { mode: "blocked" | "live" } | { mode: "fixture"; origin: string };

/** Fixed read-only endpoints. No caller can supply an origin or arbitrary path. */
export class LumaClient {
  readonly mode: ConnectionMode;
  private readonly origin: string;
  constructor(destination: Destination) {
    this.mode = destination.mode;
    this.origin = "https://public-api.luma.com";
    if (destination.mode === "fixture") {
      const url = new URL(destination.origin);
      if (
        url.protocol !== "http:" ||
        url.hostname !== "127.0.0.1" ||
        !url.port ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      )
        throw new Error("Luma fixtures require a loopback HTTP origin.");
      this.origin = url.origin;
    }
  }
  async check(apiKey: string): Promise<{ calendarId: string }> {
    const result = calendar.safeParse(
      await this.json("/v1/calendars/get", apiKey),
    );
    if (!result.success) throw new LumaRequestError("INVALID_RESPONSE");
    return { calendarId: result.data.id };
  }
  async event(apiKey: string, eventId: string, signal?: AbortSignal) {
    const result = providerEventSchema.safeParse(
      await this.json("/v1/events/get", apiKey, { event_id: eventId }, signal),
    );
    if (!result.success) throw new LumaRequestError("INVALID_RESPONSE");
    return result.data;
  }
  async guests(
    apiKey: string,
    eventId: string,
    signal: AbortSignal,
    guard: () => Promise<void>,
  ) {
    const guests = new Map<string, ImportedGuest>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      await guard();
      const parsed = providerGuestPageSchema.safeParse(
        await this.json(
          "/v1/events/guests/list",
          apiKey,
          {
            event_id: eventId,
            pagination_limit: "100",
            ...(cursor ? { pagination_cursor: cursor } : {}),
          },
          signal,
        ),
      );
      if (!parsed.success) throw new LumaRequestError("INVALID_RESPONSE");
      for (const guest of parsed.data.entries) {
        const old = guests.get(guest.providerGuestId);
        // Replayed identical entries are safe. Conflicting duplicates are not a coherent snapshot.
        if (old && JSON.stringify(old) !== JSON.stringify(guest))
          throw new LumaRequestError("INVALID_RESPONSE");
        guests.set(guest.providerGuestId, guest);
      }
      if (guests.size > 1000) throw new LumaRequestError("SYNC_LIMIT");
      if (!parsed.data.has_more) return [...guests.values()];
      cursor = parsed.data.next_cursor;
      if (!cursor || cursors.has(cursor))
        throw new LumaRequestError("INVALID_RESPONSE");
      cursors.add(cursor);
    }
    throw new LumaRequestError("SYNC_LIMIT");
  }
  async guestDetails(
    apiKey: string,
    eventId: string,
    providerGuestId: string,
    signal?: AbortSignal,
  ): Promise<ImportedPurchaseDetails> {
    const result = providerPurchaseDetailsSchema.safeParse(
      await this.json(
        "/v1/events/guests/get",
        apiKey,
        { event_id: eventId, id: providerGuestId },
        signal,
      ),
    );
    if (!result.success) throw new LumaRequestError("INVALID_RESPONSE");
    return result.data;
  }
  private async json(
    path:
      | "/v1/calendars/get"
      | "/v1/events/get"
      | "/v1/events/guests/list"
      | "/v1/events/guests/get",
    apiKey: string,
    params: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (this.mode === "blocked") throw new LumaRequestError("REQUEST_FAILED");
    try {
      const url = new URL(path, this.origin);
      url.search = new URLSearchParams(params).toString();
      const response = await fetch(url, {
        headers: { "x-luma-api-key": apiKey, Accept: "application/json" },
        redirect: "error",
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
          : AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status))
          throw new LumaRequestError("AUTH_REJECTED");
        if (response.status === 429) throw new LumaRequestError("RATE_LIMITED");
        throw new LumaRequestError("PROVIDER_UNAVAILABLE");
      }
      if (!response.headers.get("content-type")?.includes("application/json")) {
        await response.body?.cancel();
        throw new LumaRequestError("INVALID_RESPONSE");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new LumaRequestError("INVALID_RESPONSE");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > (path === "/v1/calendars/get" ? 65_536 : 1_048_576)) {
          await reader.cancel();
          throw new LumaRequestError("INVALID_RESPONSE");
        }
        chunks.push(value);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new LumaRequestError("INVALID_RESPONSE");
      }
      return parsed;
    } catch (error) {
      // Never propagate provider bodies, header values, URLs or transport exceptions.
      if (error instanceof LumaRequestError) throw error;
      throw new LumaRequestError("REQUEST_FAILED");
    }
  }
}
