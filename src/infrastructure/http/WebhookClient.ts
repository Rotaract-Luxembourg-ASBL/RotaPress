import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { webhookEndpointSchema } from "../../features/forms/webhook_schemas";

export function isPublicWebhookAddress(address: string): boolean {
  const bytes = address.split(".").map(Number);
  if (
    bytes.length !== 4 ||
    bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  )
    return false;
  const [a, b, c] = bytes;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export type WebhookSender = {
  readonly enabled: boolean;
  send(
    endpoint: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<void>;
};

/** HTTPS only, public IPv4 DNS pinned per request; no redirects, proxies or response logging. */
export class WebhookClient implements WebhookSender {
  constructor(
    readonly enabled: boolean,
    private readonly resolve = (hostname: string) =>
      lookup(hostname, { all: true, family: 4 }),
  ) {}

  async send(
    endpoint: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<void> {
    if (!this.enabled) throw new Error("WEBHOOK_DELIVERY_DISABLED");
    const url = new URL(webhookEndpointSchema.parse(endpoint));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      this.resolve(url.hostname),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("WEBHOOK_DNS_TIMEOUT")),
          3000,
        );
      }),
    ]).finally(() => clearTimeout(timeout));
    if (
      !addresses.length ||
      addresses.some(
        (item) => item.family !== 4 || !isPublicWebhookAddress(item.address),
      )
    )
      throw new Error("WEBHOOK_ADDRESS_BLOCKED");
    const address = addresses[0].address;
    await new Promise<void>((resolve, reject) => {
      const outgoing = request(
        url,
        {
          method: "POST",
          agent: false,
          family: 4,
          lookup: (_hostname, _options, callback) => callback(null, address, 4),
          signal: AbortSignal.timeout(5000),
          headers: {
            ...headers,
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(body)),
          },
        },
        (response) => {
          let bytes = 0;
          response.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 8192)
              outgoing.destroy(new Error("WEBHOOK_RESPONSE_TOO_LARGE"));
          });
          response.on("error", () =>
            reject(new Error("WEBHOOK_DELIVERY_FAILED")),
          );
          response.on("end", () => {
            if (
              response.statusCode &&
              response.statusCode >= 200 &&
              response.statusCode < 300
            )
              resolve();
            else reject(new Error("WEBHOOK_DELIVERY_FAILED"));
          });
        },
      );
      outgoing.on("error", () => reject(new Error("WEBHOOK_DELIVERY_FAILED")));
      outgoing.end(body);
    });
  }
}
