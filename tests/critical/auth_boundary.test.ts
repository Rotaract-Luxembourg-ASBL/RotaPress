import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sessionAuthenticationMethod,
  validateProviderIdentity,
  googleFlowIsCurrent,
} from "../../src/core/auth/session_policy";
import { signInDestination } from "../../src/core/auth/sign_in_destination";
import { googleSignInSchema } from "../../src/core/auth/google_sign_in";
import { DomainError } from "../../src/core/DomainError";

const handler = vi.hoisted(() =>
  vi.fn<(request: Request) => Promise<Response>>(),
);
vi.mock("@/core/auth/server", () => ({ authenticationHandler: handler }));
const googleSessionVersion = vi.hoisted(() =>
  vi.fn<(id: string) => Promise<string | null>>(),
);
vi.mock("@/core/auth/google_session", () => ({
  currentGoogleSessionVersion: googleSessionVersion,
}));
const acceptsSession = vi.hoisted(() =>
  vi.fn<(method: string) => Promise<boolean>>(),
);
vi.mock("@/core/auth/sign_in_policy", () => ({
  signInPolicy: { acceptsSession },
}));
vi.mock("@/core/config", () => ({
  config: { APP_URL: "http://127.0.0.1:3000" },
}));
import { GET, POST } from "../../src/app/api/auth/[...all]/route";

beforeEach(() => {
  handler.mockReset();
  googleSessionVersion.mockReset();
  acceptsSession.mockReset().mockResolvedValue(true);
  handler.mockImplementation(
    async () =>
      new Response(JSON.stringify({ success: true }), {
        headers: { "Set-Cookie": "transport-fixture=opaque; HttpOnly; Path=/" },
      }),
  );
});

describe("Authentication transport and provider policy", () => {
  it("preserves the policy rejection for the auth client to recover a stale email form", async () => {
    handler.mockRejectedValue(
      new DomainError(
        "GOOGLE_SIGN_IN_REQUIRED",
        "This club uses Google sign-in.",
        403,
      ),
    );
    for (const path of [
      "/email-otp/send-verification-otp",
      "/sign-in/email-otp",
    ]) {
      const response = await POST(
        new Request(`http://127.0.0.1:3000/api/auth${path}`, {
          method: "POST",
          headers: {
            origin: "http://127.0.0.1:3000",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email: "policy@example.test",
            type: "sign-in",
            otp: "123456",
          }),
        }),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        code: "GOOGLE_SIGN_IN_REQUIRED",
        message: "This club uses Google sign-in.",
      });
      expect(response.headers.get("cache-control")).toBe("no-store, private");
    }
  });
  it("hides existing email sessions when the platform requires Google", async () => {
    handler.mockResolvedValue(
      Response.json({
        session: { id: "library-session", authMethod: "email-otp" },
        user: { id: "library-user" },
      }),
    );
    acceptsSession.mockResolvedValue(false);
    const response = await GET(
      new Request("http://127.0.0.1:3000/api/auth/get-session"),
    );
    expect(await response.json()).toBeNull();
    expect(acceptsSession).toHaveBeenCalledWith("email-otp");
    expect(googleSessionVersion).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects unfinished Google flows after configuration replacement or disable/re-enable", async () => {
    let activeVersion: string | null = "revision-a";
    const accepts = async (version: string) => version === activeVersion;
    const state = { serverContext: { googleAuthVersion: "revision-a" } };
    expect(await googleFlowIsCurrent("revision-a", state, accepts)).toBe(true);
    expect(await googleFlowIsCurrent("revision-a", null, accepts)).toBe(false);
    expect(await googleFlowIsCurrent("revision-a", {}, accepts)).toBe(false);
    expect(await googleFlowIsCurrent("revision-b", state, accepts)).toBe(false);
    activeVersion = null;
    expect(await googleFlowIsCurrent("revision-a", state, accepts)).toBe(false);
    activeVersion = "revision-b";
    expect(await googleFlowIsCurrent("revision-a", state, accepts)).toBe(false);
    expect(
      await googleFlowIsCurrent(
        "revision-b",
        { serverContext: { googleAuthVersion: "revision-b" } },
        accepts,
      ),
    ).toBe(true);
  });
  it("hides disabled or obsolete Google sessions from the library session endpoint", async () => {
    handler.mockResolvedValue(
      new Response(
        JSON.stringify({
          session: { id: "library-session", authMethod: "google" },
          user: { id: "library-user" },
        }),
      ),
    );
    googleSessionVersion.mockResolvedValue(null);
    const response = await GET(
      new Request("http://127.0.0.1:3000/api/auth/get-session"),
    );
    expect(await response.json()).toBeNull();
    expect(googleSessionVersion).toHaveBeenCalledWith("library-session");
    expect(response.headers.get("cache-control")).toBe("no-store, private");
  });
  it("permits only the local Google redirect flow without browser-owned tokens or scopes", async () => {
    for (const input of [
      { provider: "google", callbackURL: "https://untrusted.example" },
      { provider: "google", idToken: { token: "untrusted" } },
      { provider: "google", scopes: ["https://www.googleapis.com/auth/drive"] },
      {
        provider: "google",
        additionalData: { serverContext: { googleAuthVersion: "untrusted" } },
      },
      { provider: "google", authProviderVersion: "untrusted" },
      { provider: "unconfigured" },
    ]) {
      const response = await POST(
        new Request("http://127.0.0.1:3000/api/auth/sign-in/social", {
          method: "POST",
          headers: {
            origin: "http://127.0.0.1:3000",
            "content-type": "application/json",
          },
          body: JSON.stringify(input),
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(handler).not.toHaveBeenCalled();
  });
  it("C02 returns guests to their local portal or registration without accepting open redirects", () => {
    const id = "12345678-1234-4321-8123-123456789012";
    for (const path of [
      "/guest",
      "/registrations",
      "/admin/calendar",
      "/calendar",
      "/calendar?tab=subscriptions",
      `/forms/${id}`,
      `/events/${id}/en/registration`,
      `/events/${id}/fr/website`,
    ]) {
      expect(signInDestination(path)).toBe(path);
      expect(
        googleSignInSchema.safeParse({ provider: "google", callbackURL: path })
          .success,
      ).toBe(true);
    }
    for (const path of [
      null,
      "//untrusted.example",
      "https://untrusted.example",
      "/guest?next=//untrusted.example",
      "/calendar?tab=subscriptions&next=//untrusted.example",
      "/calendar?tab=//untrusted.example",
      "/guest/../admin",
      `/forms/${id}/..`,
      "/%2f%2funtrusted.example",
      "/guest\\untrusted.example",
      `/events/${id}/fr/website?next=//untrusted.example`,
      `/events/${id}/zz/website`,
    ]) {
      expect(signInDestination(path)).toBe("/membership");
      if (path?.startsWith("/calendar"))
        expect(
          googleSignInSchema.safeParse({
            provider: "google",
            callbackURL: path,
          }).success,
        ).toBe(false);
    }
  });
  it("keeps library responses private and prevents forwarded-header rate-limit evasion on both verbs", async () => {
    const requests = [
      new Request("http://127.0.0.1:3000/api/auth/get-session", {
        headers: { "x-forwarded-for": "203.0.113.10" },
      }),
      new Request("http://127.0.0.1:3000/api/auth/sign-out", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:3000",
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.11",
        },
        body: "{}",
      }),
    ];
    for (const request of requests) {
      const response = await (request.method === "GET"
        ? GET(request)
        : POST(request));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store, private");
      expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    }
    expect(handler.mock.calls).toHaveLength(2);
    expect(
      handler.mock.calls.every(
        ([request]) => request.headers.get("x-forwarded-for") === "127.0.0.1",
      ),
    ).toBe(true);
  });

  it("requires verified Google profile email for linking and derives method only from the authenticated library endpoint", () => {
    const google = { method: "oauth", oauth: { providerId: "google" } };
    expect(
      validateProviderIdentity({ emailVerified: true }, google),
    ).toBeUndefined();
    expect(
      validateProviderIdentity({ emailVerified: false }, google),
    ).toMatchObject({ error: "VERIFIED_GOOGLE_EMAIL_REQUIRED" });
    expect(validateProviderIdentity({}, google)).toMatchObject({
      error: "VERIFIED_GOOGLE_EMAIL_REQUIRED",
    });
    expect(
      validateProviderIdentity(
        { emailVerified: true },
        { method: "email-otp" },
      ),
    ).toBeUndefined();
    expect(
      sessionAuthenticationMethod({
        path: "/callback/:id",
        params: { id: "google" },
      }),
    ).toBe("google");
    expect(
      sessionAuthenticationMethod({
        path: "/sign-in/email-otp",
        params: { id: "google" },
      }),
    ).toBe("email-otp");
    expect(
      sessionAuthenticationMethod({
        path: "/callback/:id",
        params: { id: "unconfigured-provider" },
      }),
    ).toBe("unknown");
    expect(
      sessionAuthenticationMethod({
        path: "/sign-in/social",
        params: { id: "google" },
      }),
    ).toBe("unknown");
  });

  it("accepts framework GET requests without depending on native Request identity", async () => {
    const controller = new AbortController();
    const frameworkRequest = {
      url: "http://127.0.0.1:3000/api/auth/get-session",
      method: "GET",
      headers: new Headers({ "x-forwarded-for": "203.0.113.12" }),
      signal: controller.signal,
    } as Request;
    const response = await GET(frameworkRequest);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    const [forwarded] = handler.mock.calls[0];
    expect(forwarded).toBeInstanceOf(Request);
    expect(forwarded.url).toBe(frameworkRequest.url);
    expect(forwarded.method).toBe("GET");
    expect(forwarded.headers.get("x-forwarded-for")).toBe("127.0.0.1");
    controller.abort();
    expect(forwarded.signal.aborted).toBe(true);
  });
});
