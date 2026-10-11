import { describe, expect, it, vi } from "vitest";
import { DomainError } from "@/core/DomainError";

vi.mock("@/core/config", () => ({
  config: { APP_URL: "http://127.0.0.1:3000" },
}));
import { handle } from "@/core/http";

describe("safe HTTP failure responses", () => {
  it("returns actionable 503 for the known preview failure without exception text", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await handle(async () => {
        throw new DomainError(
          "PREVIEW_UNAVAILABLE",
          "synthetic-private-token https://private.example.invalid/record",
          503,
        );
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error:
          "Visual preview is unavailable. Check the application runtime and installed Chromium, then try again.",
      });
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("keeps unexpected server failures and untrusted status-bearing errors generic", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const error of [
        new Error("synthetic-private-token"),
        new DomainError("AUTOMATION_RESPONSE_INVALID", "private DTO", 500),
        Object.assign(new Error("synthetic-private-token"), {
          code: "PREVIEW_UNAVAILABLE",
          status: 503,
        }),
      ]) {
        const response = await handle(async () => {
          throw error;
        });
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
          error: "The request could not be completed. Please try again.",
        });
      }
      expect(log.mock.calls).toEqual(
        Array.from({ length: 3 }, () => [
          '{"event":"request_failed","code":"INTERNAL_ERROR"}',
        ]),
      );
    } finally {
      log.mockRestore();
    }
  });
});
