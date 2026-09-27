import { describe, expect, it, vi } from "vitest";
import {
  requireRecentActor,
  type TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { sessionContextChanged } from "../../src/core/auth/request_address";
import { sensitiveSessionWindowMs } from "../../src/core/auth/recent_authentication";

describe("sensitive changes in an established session", () => {
  const actor: TrustedActor = {
    userId: "synthetic-owner",
    email: "owner@example.test",
    emailVerified: true,
    sessionId: "synthetic-session",
    authenticatedAt: new Date(),
    authMethod: "email-otp",
  };
  it("allows a working day, rejects changed context and does not trust invalid or future authentication times", () => {
    const now = Date.now();
    const time = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      for (const age of [
        0,
        16 * 60_000,
        8 * 3600_000,
        sensitiveSessionWindowMs,
      ])
        expect(() =>
          requireRecentActor({
            ...actor,
            authenticatedAt: new Date(now - age),
          }),
        ).not.toThrow();
      for (const authenticatedAt of [
        new Date(now - sensitiveSessionWindowMs - 1),
        new Date(now + 1),
        new Date(NaN),
      ])
        expect(() => requireRecentActor({ ...actor, authenticatedAt })).toThrow(
          expect.objectContaining({ code: "RECENT_AUTH_REQUIRED" }),
        );
      expect(() =>
        requireRecentActor({ ...actor, sessionContextChanged: true }),
      ).toThrow(expect.objectContaining({ code: "RECENT_AUTH_REQUIRED" }));
    } finally {
      time.mockRestore();
    }
  });
  it("uses only the configured proxy address and the original browser snapshot", () => {
    const session = {
      ipAddress: "198.51.100.10",
      userAgent: "Synthetic browser",
    };
    const headers = new Headers({
      "x-real-ip": session.ipAddress,
      "user-agent": session.userAgent,
    });
    expect(sessionContextChanged(session, headers, "trusted")).toBe(false);
    headers.set("x-forwarded-for", "203.0.113.1");
    expect(sessionContextChanged(session, headers, "trusted")).toBe(false);
    headers.set("x-real-ip", "198.51.100.11");
    expect(sessionContextChanged(session, headers, "trusted")).toBe(true);
    expect(sessionContextChanged(session, headers, "none")).toBe(false);
    headers.delete("x-real-ip");
    expect(sessionContextChanged(session, headers, "trusted")).toBe(true);
    headers.set("user-agent", "Different browser");
    expect(sessionContextChanged(session, headers, "none")).toBe(true);
    headers.delete("user-agent");
    expect(sessionContextChanged(session, headers, "none")).toBe(true);
    expect(sessionContextChanged({}, headers, "trusted")).toBe(false);
    expect(
      sessionContextChanged(
        { ipAddress: "2001:db8:0:0:0:0:0:1" },
        new Headers({ "x-real-ip": "2001:db8::1" }),
        "trusted",
      ),
    ).toBe(false);
  });
});
