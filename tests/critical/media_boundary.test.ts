import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrustedActor } from "../../src/core/authorization/AuthorizationService";

const mocks = vi.hoisted(() => ({
  actor: vi.fn<() => Promise<TrustedActor | null>>(),
  authorize: vi.fn<() => Promise<void>>(),
  limit: vi.fn<() => Promise<void>>(),
  upload: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/composition/services", () => ({ services: {
  authorization: { require: mocks.authorize },
  limiter: { consume: mocks.limit },
  media: { upload: mocks.upload },
} }));
vi.mock("@/core/auth/actor", () => ({ getActor: mocks.actor }));
vi.mock("@/core/config", () => ({ config: { APP_URL: "http://127.0.0.1:3000" } }));
import { POST } from "../../src/app/api/admin/media/route";

const origin = "http://127.0.0.1:3000";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue(null);
  mocks.authorize.mockResolvedValue();
  mocks.limit.mockResolvedValue();
});

describe("C04 upload HTTP boundary", () => {
  it("rejects unauthenticated/origin-invalid requests before reading, enforces actual bytes, and refuses duplicate multipart fields", async () => {
    const anonymous = new Request(`${origin}/api/admin/media`, {
      method: "POST", headers: { origin, "content-type": "multipart/form-data; boundary=fixture" }, body: "synthetic",
    });
    expect((await POST(anonymous)).status).toBe(401);
    expect(anonymous.bodyUsed).toBe(false);
    const foreignOrigin = new Request(`${origin}/api/admin/media`, {
      method: "POST", headers: { origin: "https://example.invalid" }, body: "synthetic",
    });
    expect((await POST(foreignOrigin)).status).toBe(403);
    expect(foreignOrigin.bodyUsed).toBe(false);

    // Transport-only fixture; PostgreSQL media checks verify actual authority.
    mocks.actor.mockResolvedValue({ userId: "synthetic-id", email: "synthetic@example.test", emailVerified: true,
      sessionId: "synthetic-session", authenticatedAt: new Date(), authMethod: "email-otp" });
    const oversized = new Request(`${origin}/api/admin/media`, {
      method: "POST", headers: { origin, "content-type": "multipart/form-data; boundary=fixture", "content-length": "1" },
      body: new Uint8Array(5 * 1024 * 1024 + 16_384 + 1),
    });
    const rejected = await POST(oversized);
    expect(rejected.status).toBe(413);
    expect(rejected.headers.get("cache-control")).toBe("no-store");

    const form = new FormData();
    form.append("file", new File(["synthetic"], "fixture.png", { type: "image/png" }));
    form.append("title", "First title");
    form.append("title", "Conflicting title");
    const duplicated = new Request(`${origin}/api/admin/media`, { method: "POST", headers: { origin }, body: form });
    expect((await POST(duplicated)).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
