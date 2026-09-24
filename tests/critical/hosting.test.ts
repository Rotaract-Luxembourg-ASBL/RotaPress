import { describe, expect, it } from "vitest";
import { runtimeConfiguration } from "../../src/core/runtime_configuration";
import { authenticationAddress } from "../../src/core/auth/request_address";
import {
  readSetupClaim,
  setupCookie,
} from "../../src/core/installation/setup_cookie";
import { hostedEnvironment } from "../../scripts/hosting/runtime.mjs";
import {
  databaseConnection,
  hostingKeys,
} from "../../scripts/hosting/database.mjs";

const local = {
  DATABASE_URL:
    "postgresql://rotapress_app:synthetic@127.0.0.1:55432/rotapress",
  BETTER_AUTH_SECRET: "synthetic-authentication-key-00000000000000",
  APP_URL: "http://127.0.0.1:3000",
};
const hosted = {
  ...local,
  ROTAPRESS_DEPLOYMENT: "hosted",
  ROTAPRESS_PROXY: "trusted",
  DATABASE_URL: "postgresql://rotapress_app:synthetic@postgres:5432/rotapress",
  APP_URL: "https://club.example.org",
  INTEGRATION_ENCRYPTION_KEY: "1".repeat(64),
};
describe("Portable hosted configuration", () => {
  it("requires explicit hosted mode, HTTPS and a restricted dedicated database", () => {
    expect(runtimeConfiguration(local).ROTAPRESS_DEPLOYMENT).toBe("local");
    expect(runtimeConfiguration(hosted).APP_URL).toBe(hosted.APP_URL);
    for (const change of [
      { ROTAPRESS_DEPLOYMENT: "local" },
      { APP_URL: "http://club.example.org" },
      { APP_URL: "https://127.0.0.1" },
      { APP_URL: "https://club.example.org/path" },
      { APP_URL: "https://club.example.org?claim=private" },
      { INTEGRATION_ENCRYPTION_KEY: undefined },
      { DATABASE_URL: "postgresql://postgres:synthetic@postgres/rotapress" },
      {
        DATABASE_URL:
          "postgresql://rotapress_app:synthetic@postgres/another_app",
      },
      { EMAIL_PROVIDER: "development" },
      { ROTAPRESS_ENVIRONMENT: "test" },
      { LUMA_FIXTURE_ORIGIN: "http://127.0.0.1:3400" },
    ])
      expect(() => runtimeConfiguration({ ...hosted, ...change })).toThrow();
  });
  it("keeps bootstrap secrets out of child processes and derives stable independent credentials", () => {
    const keys = hostingKeys("a".repeat(64));
    expect(new Set(Object.values(keys)).size).toBe(4);
    expect(hostingKeys("a".repeat(64))).toEqual(keys);
    const credentials = {
      DATABASE_URL: hosted.DATABASE_URL,
      BETTER_AUTH_SECRET: keys.auth,
      INTEGRATION_ENCRYPTION_KEY: keys.encryption,
    };
    const env = hostedEnvironment(
      {
        ...hosted,
        BOOTSTRAP_DATABASE_URL: "privileged",
        ROTAPRESS_HOSTING_KEY: "master",
        ROTAPRESS_SETUP_CLAIM: "claim",
        RAILWAY_TOKEN: "token",
        NODE_OPTIONS: "untrusted",
        RESEND_API_KEY: "sender",
      },
      credentials,
    );
    expect(env).toMatchObject(credentials);
    for (const key of [
      "BOOTSTRAP_DATABASE_URL",
      "ROTAPRESS_HOSTING_KEY",
      "ROTAPRESS_SETUP_CLAIM",
      "RAILWAY_TOKEN",
      "NODE_OPTIONS",
    ])
      expect(env).not.toHaveProperty(key);
    expect(env).toHaveProperty("RESEND_API_KEY", "sender");
    expect(() =>
      databaseConnection(
        "postgresql://admin:secret@postgres/another_app",
        "rotapress_app",
        keys.runtime,
      ),
    ).toThrow();
  });
  it("ignores forged forwarding chains and uses only an explicitly trusted edge address", () => {
    const headers = new Headers({
      "x-real-ip": "198.51.100.42",
      "x-forwarded-for": "203.0.113.1",
    });
    expect(authenticationAddress(headers, "none")).toBe("127.0.0.1");
    expect(authenticationAddress(headers, "trusted")).toBe("198.51.100.42");
    headers.set("x-real-ip", "198.51.100.42, 203.0.113.1");
    expect(authenticationAddress(headers, "trusted")).toBe("127.0.0.1");
  });
  it("keeps setup claims in secure HttpOnly cookies with bounded syntax", () => {
    const claim = "a".repeat(43);
    const cookie = setupCookie(claim, true);
    for (const option of [
      "HttpOnly",
      "SameSite=Strict",
      "Secure",
      "Max-Age=3600",
    ])
      expect(cookie).toContain(option);
    expect(readSetupClaim(new Headers({ cookie }))).toBe(claim);
    expect(
      readSetupClaim(new Headers({ cookie: "rotapress_setup=invalid" })),
    ).toBe("");
    expect(setupCookie("", true)).toContain("Max-Age=0");
  });
});
