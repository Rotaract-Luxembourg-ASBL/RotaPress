import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isPublicWebhookAddress } from "@/infrastructure/http/WebhookClient";
import { DomainError } from "@/core/DomainError";
import {
  referenceContent,
  referenceUrlSchema,
  robotsAllows,
} from "./reference_content";

export interface ReferenceTransport {
  read(
    url: string,
    maxBytes: number,
  ): Promise<{ status: number; type: string; text: string }>;
}

/** Every DNS result is checked; the validated address is pinned to TLS. No cookies, redirects or proxies. */
export class ReferenceHttpTransport implements ReferenceTransport {
  constructor(
    private readonly resolve = (host: string) =>
      lookup(host, { all: true, family: 4 }),
  ) {}
  async read(raw: string, maxBytes: number) {
    const url = new URL(referenceUrlSchema.parse(raw));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      this.resolve(url.hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("SOURCE_DNS_TIMEOUT")), 3000);
      }),
    ]).finally(() => clearTimeout(timer));
    if (
      !addresses.length ||
      addresses.some(
        (item) => item.family !== 4 || !isPublicWebhookAddress(item.address),
      )
    )
      throw new DomainError(
        "SOURCE_ADDRESS_BLOCKED",
        "This reference website does not resolve to a public address.",
        422,
      );
    return new Promise<{ status: number; type: string; text: string }>(
      (resolve, reject) => {
        const outgoing = request(
          url,
          {
            method: "GET",
            agent: false,
            family: 4,
            signal: AbortSignal.timeout(8000),
            lookup: (_host, _options, callback) =>
              callback(null, addresses[0].address, 4),
            headers: {
              accept: "text/html,text/plain",
              "accept-encoding": "identity",
              "user-agent": "RotaPress-Content/1",
            },
          },
          (response) => {
            if (
              response.headers["content-encoding"] &&
              response.headers["content-encoding"] !== "identity"
            ) {
              response.destroy();
              reject(new Error("SOURCE_ENCODING_UNSUPPORTED"));
              return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            response.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > maxBytes)
                outgoing.destroy(new Error("SOURCE_TOO_LARGE"));
              else chunks.push(chunk);
            });
            response.on("error", () =>
              reject(new Error("SOURCE_REQUEST_FAILED")),
            );
            response.on("end", () =>
              resolve({
                status: response.statusCode ?? 500,
                type: response.headers["content-type"] ?? "",
                text: Buffer.concat(chunks).toString("utf8"),
              }),
            );
          },
        );
        outgoing.on("error", () => reject(new Error("SOURCE_REQUEST_FAILED")));
        outgoing.end();
      },
    );
  }
}

export class ReferenceWebsiteClient {
  constructor(
    private readonly transport: ReferenceTransport = new ReferenceHttpTransport(),
  ) {}
  async inspect(raw: string, allowedOrigins: string[]) {
    const url = new URL(referenceUrlSchema.parse(raw));
    if (!allowedOrigins.includes(url.origin))
      throw new DomainError(
        "SOURCE_ORIGIN_DENIED",
        "This connection is not allowed to read that reference website.",
        403,
      );
    try {
      const robots = await this.transport.read(
        `${url.origin}/robots.txt`,
        64000,
      );
      if (
        robots.status !== 404 &&
        (robots.status !== 200 ||
          !robotsAllows(robots.text, url.pathname + url.search))
      )
        throw new DomainError(
          "SOURCE_ROBOTS_DENIED",
          "The reference site's robots policy does not allow this request.",
          422,
        );
      const response = await this.transport.read(url.href, 512000);
      if (response.status !== 200 || !/^text\/html(?:;|$)/i.test(response.type))
        throw new DomainError(
          "SOURCE_HTML_REQUIRED",
          "Use the final public URL of an HTML page. Redirects and private pages are not followed.",
          422,
        );
      return referenceContent(response.text, url.href);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "SOURCE_UNAVAILABLE",
        "The reference page could not be read within the size and time limits.",
        422,
      );
    }
  }
}
