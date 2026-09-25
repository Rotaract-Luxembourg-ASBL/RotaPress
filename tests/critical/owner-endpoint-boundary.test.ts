import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrustedActor } from "../../src/core/authorization/AuthorizationService";
import { DomainError } from "../../src/core/DomainError";

// Route-ordering fixtures only. C01/C02 exercise actual claims and permissions in PostgreSQL.
const mocks = vi.hoisted(() => ({
  actor: vi.fn<() => Promise<TrustedActor | null>>(),
  consume:
    vi.fn<(scope: string, identity: string, max: number) => Promise<void>>(),
  complete: vi.fn(),
  recover: vi.fn(),
}));
vi.mock("@/core/auth/actor", () => ({ getActor: mocks.actor }));
vi.mock("@/core/config", () => ({
  config: { APP_URL: "http://127.0.0.1:3000" },
}));
vi.mock("@/composition/email", () => ({
  emailDelivery: { requireServerConnection() {} },
}));
vi.mock("@/composition/services", () => ({
  services: {
    limiter: { consume: mocks.consume },
    installation: { complete: mocks.complete },
  },
}));
vi.mock("@/infrastructure/database/client", () => ({ db: {} }));
vi.mock("@/core/installation/RecoveryService", () => ({
  RecoveryService: class {
    complete = mocks.recover;
  },
}));
import { POST as setup } from "../../src/app/api/setup/route";
import { POST as recovery } from "../../src/app/api/recovery/route";

const origin = "http://127.0.0.1:3000";
const request = () =>
  new Request(`${origin}/api/setup`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}",
  });
const actor = (userId: string): TrustedActor => ({
  userId,
  sessionId: `fixture-${userId}`,
  email: `${userId}@example.test`,
  emailVerified: true,
  authMethod: "email-otp",
  authenticatedAt: new Date(),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue(null);
  const buckets = new Map<string, number>();
  mocks.consume.mockImplementation(async (scope, identity, max) => {
    const key = `${scope}:${identity}`;
    const count = (buckets.get(key) ?? 0) + 1;
    buckets.set(key, count);
    if (count > max)
      throw new DomainError("RATE_LIMITED", "Too many requests.", 429);
  });
  const invalidClaim = async () => {
    throw new DomainError("CLAIM_INVALID", "Invalid claim.", 409);
  };
  mocks.complete.mockImplementation(invalidClaim);
  mocks.recover.mockImplementation(invalidClaim);
});

describe("C01 owner endpoint quota isolation", () => {
  for (const [name, handler, limit] of [
    ["setup", setup, 10],
    ["recovery", recovery, 5],
  ] as const) {
    it(`${name}: anonymous requests cannot exhaust the owner's quota`, async () => {
      for (let i = 0; i <= limit; i++)
        expect((await handler(request())).status).toBe(401);
      expect(mocks.consume).not.toHaveBeenCalled();
      expect(mocks.complete).not.toHaveBeenCalled();
      expect(mocks.recover).not.toHaveBeenCalled();
    });
    it(`${name}: another identity's failed claims cannot throttle the owner`, async () => {
      mocks.actor.mockResolvedValue(actor("other"));
      for (let i = 0; i < limit; i++)
        expect((await handler(request())).status).toBe(409);
      expect((await handler(request())).status).toBe(429);
      mocks.actor.mockResolvedValue(actor("owner"));
      expect((await handler(request())).status).toBe(409);
    });
    it(`${name}: unverified identities cannot create quota state`, async () => {
      mocks.actor.mockResolvedValue({
        ...actor("unverified"),
        emailVerified: false,
      });
      expect((await handler(request())).status).toBe(401);
      expect(mocks.consume).not.toHaveBeenCalled();
    });
  }
});
