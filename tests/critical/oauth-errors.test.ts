import { describe, expect, it } from "vitest";
import {
  oauthConnectionError,
  oauthErrorPath,
} from "../../src/integrations/automation/oauth/errors";

describe("OAuth recovery routing", () => {
  it("recognizes connection failures without misclassifying generic Google errors", () => {
    expect(oauthConnectionError("invalid_client")).toBe("invalid_client");
    for (const value of [
      "access_denied",
      "login_required",
      "unknown",
      undefined,
      { error: "invalid_client" },
    ])
      expect(oauthConnectionError(value)).toBeUndefined();
  });
  it("retains known protocol codes only and drops arbitrary text or destinations", () => {
    expect(oauthErrorPath("access_denied")).toBe(
      "/oauth/error?error=access_denied",
    );
    for (const value of [
      "https://evil.example/?client_id=private",
      "invalid_client&next=//evil.example",
      undefined,
      {},
    ])
      expect(oauthErrorPath(value)).toBe("/oauth/error?error=invalid_request");
  });
});
