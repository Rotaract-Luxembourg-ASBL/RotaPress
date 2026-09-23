import "server-only";
import { ZodError } from "zod";
import { config } from "./config";
import { permittedBrowserOrigin } from "./origin-policy";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function requireMutationOrigin(request: Request): void {
  if (!permittedBrowserOrigin(request.headers.get("origin"), config.APP_URL)) {
    throw new HttpError(403, "Request origin is not allowed.");
  }
}

export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function readMutation(
  request: Request,
  maxBytes = 16_384,
): Promise<unknown> {
  requireMutationOrigin(request);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new HttpError(415, "Use a JSON request.");
  }
  const body = await readBoundedBody(request, maxBytes);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body is invalid JSON.");
  }
}

export async function handle(
  operation: () => Promise<Response>,
): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json(
        {
          error: error.issues
            .map(
              (issue) => `${issue.path.join(".") || "Input"}: ${issue.message}`,
            )
            .join(" "),
        },
        400,
      );
    if (
      error instanceof Error &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status < 500
    ) {
      return json({ error: error.message }, error.status);
    }
    // No raw database/auth exceptions or request data in logs or responses.
    console.error(
      JSON.stringify({ event: "request_failed", code: "INTERNAL_ERROR" }),
    );
    return json(
      { error: "The request could not be completed. Please try again." },
      500,
    );
  }
}
