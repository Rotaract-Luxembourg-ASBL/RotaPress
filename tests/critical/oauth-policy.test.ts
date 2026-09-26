import { describe, expect, it } from "vitest";
import {
  oauthClientInput,
  oauthClientMetadata,
  oauthConsentInput,
  validOAuthRedirect,
} from "../../src/integrations/automation/oauth/policy";
import {
  decodePendingOAuth,
  encodePendingOAuth,
} from "../../src/integrations/automation/oauth/pending";

describe("C14 OAuth registration and consent boundaries", () => {
  it("accepts exact HTTPS redirects and only local installations may use loopback HTTP", () => {
    expect(
      validOAuthRedirect(
        "https://chatgpt.com/connector_platform_oauth_redirect",
        "https://club.example.org",
      ),
    ).toBe(true);
    expect(
      validOAuthRedirect(
        "http://127.0.0.1:49120/callback",
        "http://127.0.0.1:3000",
      ),
    ).toBe(true);
    for (const uri of [
      "http://127.0.0.1:49120/callback",
      "http://example.org/callback",
      "javascript:alert(1)",
      "https://user:secret@example.org/callback",
      "https://example.org/callback#fragment",
      "https://example.org/callback?next=elsewhere",
      "https://example.org\\@bad.example/callback",
    ])
      expect(validOAuthRedirect(uri, "https://club.example.org")).toBe(false);
    for (const uri of [
      "http://127.1/callback",
      "http://2130706433/callback",
      "http://192.168.1.1/callback",
    ])
      expect(validOAuthRedirect(uri, "http://127.0.0.1:3000")).toBe(false);
  });
  it("rejects browser authority, publication, client metadata fetch and machine grants", () => {
    const valid = {
      name: "Synthetic assistant",
      redirectUris: ["https://client.example.org/callback"],
      scopes: ["website:read"],
    };
    expect(oauthClientInput.safeParse(valid).success).toBe(true);
    for (const field of [
      "userId",
      "organizationId",
      "skip_consent",
      "require_pkce",
      "grant_types",
      "jwks_uri",
      "metadata",
      "resources",
    ])
      expect(
        oauthClientInput.safeParse({ ...valid, [field]: "injected" }).success,
      ).toBe(false);
    expect(
      oauthClientInput.safeParse({ ...valid, scopes: ["website:publish"] })
        .success,
    ).toBe(false);
    expect(
      oauthConsentInput.safeParse({
        oauth_query: "signed",
        accept: true,
        scopes: ["website:publish"],
      }).success,
    ).toBe(false);
    expect(
      oauthConsentInput.safeParse({
        oauth_query: "signed",
        accept: true,
        scopes: ["website:read"],
        userId: "forged",
      }).success,
    ).toBe(false);
  });
  it("bounds retained authorization requests without accepting malformed compression", () => {
    const query =
      "client_id=synthetic&state=correlated&scope=website%3Aread&sig=synthetic";
    expect(decodePendingOAuth(encodePendingOAuth(query))).toBe(query);
    expect(decodePendingOAuth("invalid.deflate")).toBeNull();
    expect(decodePendingOAuth("a".repeat(3001))).toBeNull();
    expect(() => encodePendingOAuth("a".repeat(6001))).toThrow();
  });
  it("accepts only the narrow provider-stored connection metadata", () => {
    const value = {
      purpose: "rotapress-oauth-v1",
      organizationId: "4dacd24e-ea41-410e-a564-11619a5f4dd2",
      sourceOrigins: ["https://www.rotary.org"],
    };
    expect(oauthClientMetadata.parse(JSON.stringify(value))).toEqual(value);
    expect(oauthClientMetadata.safeParse("not-json").success).toBe(false);
    expect(
      oauthClientMetadata.safeParse({ ...value, role: "owner" }).success,
    ).toBe(false);
  });
});
