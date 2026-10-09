import { describe, expect, it } from "vitest";
import {
  normalizeReferenceDomain,
  sourceRuleSchema,
  sourceRulesAllow,
} from "../../src/integrations/automation/source_rules";
import {
  connectionInput,
  connectionMetadata,
} from "../../src/integrations/automation/scopes";
import { oauthClientMetadata } from "../../src/integrations/automation/oauth/policy";
import {
  ReferenceWebsiteClient,
  type ReferenceTransport,
} from "../../src/integrations/automation/ReferenceWebsiteClient";

describe("C14 reviewed reference domain rules", () => {
  it("covers the named host and dot-bounded subdomains without widening old exact origins", () => {
    const rules = [sourceRuleSchema.parse(" ROTARACT.LU ")];
    expect(rules).toEqual(["rotaract.lu"]);
    for (const host of [
      "rotaract.lu",
      "www.rotaract.lu",
      "foo.rotaract.lu",
      "a.b.rotaract.lu",
    ])
      expect(sourceRulesAllow(`https://${host}/about`, rules), host).toBe(true);
    for (const host of ["evilrotaract.lu", "rotaract.lu.evil", "rotary.org"])
      expect(sourceRulesAllow(`https://${host}/about`, rules), host).toBe(
        false,
      );
    expect(
      sourceRulesAllow("https://www.rotaract.lu/", ["https://rotaract.lu"]),
    ).toBe(false);
    expect(
      sourceRulesAllow("https://foo.rotaract.lu/", ["https://www.rotaract.lu"]),
    ).toBe(false);
    expect(
      sourceRulesAllow("https://rotaract.lu/", ["https://rotaract.lu"]),
    ).toBe(true);
    expect(sourceRulesAllow("https://rotaract.lu/", ["www.rotaract.lu"])).toBe(
      false,
    );
    expect(
      sourceRulesAllow("https://a.www.rotaract.lu/", ["www.rotaract.lu"]),
    ).toBe(true);
  });

  it("rejects public/private suffix grants, local/IP hosts, unknown suffixes, wildcards and nondefault ports", () => {
    for (const rule of [
      "lu",
      "co.uk",
      "github.io",
      "s3.amazonaws.com",
      "*.rotaract.lu",
      "*",
      "localhost",
      "club.local",
      "club.internal",
      "club.test",
      "club.invalid",
      "club.onion",
      "home.arpa",
      "example.org",
      "rotaract.unregisteredtld",
      "127.0.0.1",
      "2130706433",
      "[::1]",
      "rotaract.lu:443",
      "rotaract.lu:8443",
      "rotaract.lu/path",
      "rotaract.lu.",
      "bad..rotaract.lu",
      "-bad.rotaract.lu",
      "https://rotaract.lu:8443",
      "http://rotaract.lu",
      "https://user@rotaract.lu",
    ])
      expect(sourceRuleSchema.safeParse(rule).success, rule).toBe(false);
    for (const url of [
      "http://www.rotaract.lu/",
      "https://www.rotaract.lu:8443/",
      "https://user:secret@www.rotaract.lu/",
      "https://www.rotaract.lu/#fragment",
      "https://127.0.0.1/",
      "https://club.local/",
      "https://club.test/",
    ])
      expect(
        sourceRulesAllow(url, ["rotaract.lu", new URL(url).origin]),
        url,
      ).toBe(false);
    expect(
      sourceRulesAllow("https://www.rotaract.lu:443/", ["rotaract.lu"]),
    ).toBe(true);
  });

  it("suggests a registrable domain for deliberate conversion and respects private suffix tenant boundaries", () => {
    expect(
      normalizeReferenceDomain("https://www.rotaract.lu/about?language=en"),
    ).toBe("rotaract.lu");
    expect(normalizeReferenceDomain("www.rotaract.lu")).toBe("rotaract.lu");
    expect(
      normalizeReferenceDomain("https://images.club.github.io/a.webp"),
    ).toBe("club.github.io");
    expect(normalizeReferenceDomain("https://github.io/")).toBeNull();
    expect(
      normalizeReferenceDomain("https://rotaract.lu:8443/page"),
    ).toBeNull();
    expect(normalizeReferenceDomain("https://127.0.0.1/")).toBeNull();
    expect(
      sourceRulesAllow("https://a.club.github.io/", ["club.github.io"]),
    ).toBe(true);
    expect(
      sourceRulesAllow("https://other.github.io/", ["club.github.io"]),
    ).toBe(false);
    expect(sourceRuleSchema.parse("b\u00fccher.de")).toBe("xn--bcher-kva.de");
  });

  it("preserves persisted exact origin metadata without silently broadening legacy grants", () => {
    const sourceOrigins = [
      "https://rotaract.lu",
      "https://source.example",
      "https://127.0.0.1",
    ];
    const common = {
      organizationId: "4dacd24e-ea41-410e-a564-11619a5f4dd2",
      sourceOrigins,
    };
    expect(
      connectionMetadata.parse({
        ...common,
        purpose: "rotapress-automation-v1",
        transport: "mcp",
        sessionId: "fixture",
      }).sourceOrigins,
    ).toEqual(sourceOrigins);
    expect(
      oauthClientMetadata.parse(
        JSON.stringify({
          ...common,
          purpose: "rotapress-oauth-v1",
        }),
      ).sourceOrigins,
    ).toEqual(sourceOrigins);
    expect(sourceRulesAllow("https://www.rotaract.lu/", sourceOrigins)).toBe(
      false,
    );
    expect(sourceRulesAllow("https://127.0.0.1/", sourceOrigins)).toBe(false);
    expect(sourceRulesAllow("https://source.example/", sourceOrigins)).toBe(
      false,
    );
    expect(
      connectionInput.parse({
        name: "Domain approval",
        scopes: ["sources:read"],
        sourceOrigins: ["ROTARACT.LU"],
      }).sourceOrigins,
    ).toEqual(["rotaract.lu"]);
    expect(
      connectionInput.safeParse({
        name: "Unsafe new source",
        scopes: ["sources:read"],
        sourceOrigins: ["https://127.0.0.1"],
      }).success,
    ).toBe(false);
  });

  it("checks each approved subdomain's own robots policy and rejects other hosts before fetching", async () => {
    const calls: string[] = [];
    const transport: ReferenceTransport = {
      async read(url) {
        calls.push(url);
        return url.endsWith("/robots.txt")
          ? {
              status: 200,
              type: "text/plain",
              text: "User-agent: *\nDisallow: /private",
            }
          : {
              status: 200,
              type: "text/html",
              text: "<h1>Club</h1><p>Community</p>",
            };
      },
    };
    const client = new ReferenceWebsiteClient(transport);
    expect(
      (await client.inspect("https://foo.rotaract.lu/about", ["rotaract.lu"]))
        .text,
    ).toBe("Community");
    expect(calls).toEqual([
      "https://foo.rotaract.lu/robots.txt",
      "https://foo.rotaract.lu/about",
    ]);
    calls.length = 0;
    await expect(
      client.inspect("https://www.rotaract.lu/private", ["rotaract.lu"]),
    ).rejects.toMatchObject({ code: "SOURCE_ROBOTS_DENIED" });
    expect(calls).toEqual(["https://www.rotaract.lu/robots.txt"]);
    calls.length = 0;
    await expect(
      client.inspect("https://evilrotaract.lu/about", ["rotaract.lu"]),
    ).rejects.toMatchObject({ code: "SOURCE_ORIGIN_DENIED" });
    await expect(
      client.inspect("https://www.rotaract.lu/about", ["https://rotaract.lu"]),
    ).rejects.toMatchObject({ code: "SOURCE_ORIGIN_DENIED" });
    expect(calls).toHaveLength(0);
  });
});
