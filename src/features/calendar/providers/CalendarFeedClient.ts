import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { z } from "zod";
import { isPublicWebhookAddress } from "@/infrastructure/http/WebhookClient";

export const calendarFeedUrlSchema = z
  .url()
  .max(500)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (!url.port || url.port === "443") &&
      !url.username &&
      !url.password &&
      !url.hash &&
      /^[a-z0-9.-]+$/i.test(url.hostname) &&
      url.hostname.includes(".") &&
      !/^\d+(\.\d+){3}$/.test(url.hostname) &&
      !/(^|\.)(localhost|local|internal|test|invalid|example)$/i.test(
        url.hostname,
      )
    );
  }, "Use a public HTTPS calendar URL, on port 443, up to 500 characters.");
export interface CalendarFeedTransport {
  readonly enabled: boolean;
  read(endpoint: string): Promise<string>;
}
/** URLs may contain private subscription keys: never log or return them. */
export class CalendarFeedClient implements CalendarFeedTransport {
  constructor(
    readonly enabled: boolean,
    private readonly resolve = (host: string) =>
      lookup(host, { all: true, family: 4 }),
  ) {}
  async read(endpoint: string) {
    if (!this.enabled) throw new Error("CALENDAR_FEED_REQUESTS_DISABLED");
    const url = new URL(calendarFeedUrlSchema.parse(endpoint));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      this.resolve(url.hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("FEED_DNS_TIMEOUT")), 3000);
      }),
    ]).finally(() => clearTimeout(timer));
    if (
      !addresses.length ||
      addresses.some(
        (item) => item.family !== 4 || !isPublicWebhookAddress(item.address),
      )
    )
      throw new Error("FEED_ADDRESS_BLOCKED");
    return new Promise<string>((resolve, reject) => {
      const outgoing = request(
        url,
        {
          method: "GET",
          agent: false,
          family: 4,
          lookup: (_host, _options, callback) =>
            callback(null, addresses[0].address, 4),
          signal: AbortSignal.timeout(10000),
          headers: {
            accept: "text/calendar",
            "accept-encoding": "identity",
            "user-agent": "RotaPress-Calendar/1",
          },
        },
        (response) => {
          if (
            response.statusCode !== 200 ||
            (response.headers["content-encoding"] &&
              response.headers["content-encoding"] !== "identity")
          ) {
            response.destroy();
            reject(new Error("FEED_RESPONSE_UNAVAILABLE"));
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          response.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 524288) outgoing.destroy(new Error("FEED_TOO_LARGE"));
            else chunks.push(chunk);
          });
          response.on("error", () =>
            reject(new Error("FEED_RESPONSE_UNAVAILABLE")),
          );
          response.on("end", () =>
            resolve(Buffer.concat(chunks).toString("utf8")),
          );
        },
      );
      outgoing.on("error", () =>
        reject(new Error("FEED_RESPONSE_UNAVAILABLE")),
      );
      outgoing.end();
    });
  }
}
