import { authenticationHandler } from "@/core/auth/server";
import { googleSignInSchema } from "@/core/auth/google_sign_in";
import { currentGoogleSessionVersion } from "@/core/auth/google_session";
import { z } from "zod";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { config } from "@/core/config";
import { authenticationAddress } from "@/core/auth/request_address";

export const runtime = "nodejs";

const postPaths = new Set([
  "/sign-in/email-otp",
  "/email-otp/send-verification-otp",
  "/sign-out",
  "/sign-in/social",
]);

async function authenticationResponse(request: Request): Promise<Response> {
  const headers = new Headers(request.headers);
  const address = authenticationAddress(headers, config.ROTAPRESS_PROXY);
  headers.set("x-forwarded-for", address);
  headers.set("x-real-ip", address);
  // A framework GET request can come from a different Request implementation.
  // Pass primitive metadata instead of asking the native constructor to copy it.
  const forwarded =
    request.method === "GET"
      ? new Request(request.url, {
          method: "GET",
          headers,
          signal: request.signal,
        })
      : new Request(request, { headers });
  const response = await authenticationHandler(forwarded);
  const responseHeaders = new Headers(response.headers);
  // Some library sign-in responses carry a session token in the JSON body.
  // Preserve library cookies while forbidding browser and intermediary caching.
  responseHeaders.set("Cache-Control", "no-store, private");
  responseHeaders.set("Pragma", "no-cache");
  if (
    new URL(request.url).pathname === "/api/auth/get-session" &&
    response.ok
  ) {
    const result = z
      .object({ session: z.object({ id: z.string(), authMethod: z.string() }) })
      .safeParse(await response.clone().json());
    if (
      result.success &&
      result.data.session.authMethod === "google" &&
      !(await currentGoogleSessionVersion(result.data.session.id))
    ) {
      return new Response("null", { status: 200, headers: responseHeaders });
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

async function dispatch(request: Request) {
  return handle(async () => {
    const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
    if (request.method === "POST") {
      if (!postPaths.has(path))
        return json({ error: "Unsupported authentication operation." }, 404);
      const input = await readMutation(request);
      const body =
        path === "/sign-in/social" ? googleSignInSchema.parse(input) : input;
      if (
        path === "/email-otp/send-verification-otp" &&
        (!body ||
          typeof body !== "object" ||
          !("type" in body) ||
          body.type !== "sign-in")
      ) {
        throw new HttpError(
          400,
          "Only sign-in verification codes are supported.",
        );
      }
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      return authenticationResponse(
        new Request(request.url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      );
    }
    if (path !== "/get-session" && path !== "/callback/google") {
      return json({ error: "Unsupported authentication operation." }, 404);
    }
    return authenticationResponse(request);
  });
}

export const GET = dispatch;
export const POST = dispatch;
