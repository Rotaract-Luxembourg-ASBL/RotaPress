import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { operations } from "../../src/integrations/automation/catalogue";
import { openApiDocument } from "../../src/integrations/automation/openapi";
import {
  operation,
  type AutomationContext,
} from "../../src/integrations/automation/operation";
import { createMcpServer } from "../../src/integrations/automation/mcp_server";
import {
  restRequest,
  testerFetch,
} from "../../src/integrations/automation/ui/tester_request";
import {
  contentTools,
  openAiApprovalPolicy,
  publicationTools,
} from "../../src/integrations/automation/client_examples";

// Protocol-only fixtures do not connect to a database or initialize Better Auth.
vi.mock("../../src/core/config", () => ({
  config: { APP_URL: "http://127.0.0.1:3000" },
}));

describe("C14 documented contracts and failure privacy", () => {
  it("provides valid examples, closed response shapes and resolvable OpenAPI references", () => {
    const spec = openApiDocument();
    for (const op of operations) {
      expect(op.input.safeParse(op.example).success, op.name).toBe(true);
      expect(spec.components.schemas[`${op.name}_response`]).toMatchObject({
        type: "object",
        required: ["data"],
        additionalProperties: false,
      });
    }
    function walk(value: unknown) {
      if (!value || typeof value !== "object") return;
      if ("$ref" in value && typeof value.$ref === "string") {
        expect(value.$ref.startsWith("#/components/schemas/")).toBe(true);
        let target: unknown = spec;
        for (const part of value.$ref.slice(2).split("/")) {
          const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
          target =
            target && typeof target === "object"
              ? Reflect.get(target, key)
              : undefined;
        }
        expect(target, value.$ref).toBeDefined();
      }
      for (const item of Object.values(value)) walk(item);
    }
    walk(spec);
    // Copied client snippets must not hide tools that the connection grants.
    expect([...contentTools].sort()).toEqual(
      operations.map((op) => op.name).sort(),
    );
  });
  it("fails closed when a service unexpectedly includes sensitive fields", async () => {
    // This contract unit test never authenticates or constructs a staff session.
    const boundary = operation(
      {
        name: "fixture",
        description: "Injected response privacy fixture",
        method: "GET",
        path: "/fixture",
        scope: null,
        input: z.strictObject({}),
        output: z.strictObject({ title: z.string() }),
        example: {},
      },
      async () => ({ title: "Safe", privateCredential: "synthetic-secret" }),
    );
    const error = await boundary
      .run({} as AutomationContext, {})
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      code: "AUTOMATION_RESPONSE_INVALID",
      status: 500,
    });
    expect(String(error)).not.toContain("synthetic-secret");
  });
  it("requires confirmation and client approval for every publication action", () => {
    const publishing = operations.filter((op) =>
      op.scope?.endsWith(":publish"),
    );
    expect(publishing.map((op) => op.name).sort()).toEqual(
      [...publicationTools].sort(),
    );
    for (const op of publishing) {
      expect(
        op.input.safeParse({ ...op.example, confirmed: undefined }).success,
        op.name,
      ).toBe(false);
      expect(
        op.input.safeParse({ ...op.example, confirmed: false }).success,
        op.name,
      ).toBe(false);
      expect(openAiApprovalPolicy.always.tool_names).toContain(op.name);
      expect(openAiApprovalPolicy.never.tool_names).not.toContain(op.name);
    }
  });
  it("returns a generic MCP resource error rather than internal provider/database text", async () => {
    // Inject only the dependency used by this handler. No identity or database is forged.
    const context = {
      services: {
        authorization: {
          features: {
            states: async () => {
              throw new Error("synthetic-private-database-detail");
            },
          },
        },
      },
      principal: { organizationId: "unused", scopes: [], sourceOrigins: [] },
    } as unknown as AutomationContext;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = createMcpServer(context);
    const client = new Client({ name: "error-contract-fixture", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const error = await client
        .readResource({ uri: "rotapress://capabilities" })
        .catch((cause: unknown) => cause);
      expect(String(error)).toContain("This resource could not be read");
      expect(String(error)).not.toContain("synthetic-private-database-detail");
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        "synthetic-private-database-detail",
      );
    } finally {
      await client.close();
      await server.close();
      log.mockRestore();
    }
  });
  it("keeps tester credentials on same-instance endpoints and omits browser cookies", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", fetcher);
    const key = "rp_synthetic_fixture_1234567890123456";
    try {
      await expect(
        testerFetch(key, "https://elsewhere.org/api/v1/content", "GET"),
      ).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
      await testerFetch(key, "/api/v1/capabilities", "GET");
      expect(fetcher).toHaveBeenCalledWith(
        "/api/v1/capabilities",
        expect.objectContaining({
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          referrerPolicy: "no-referrer",
        }),
      );
      expect(() =>
        restRequest(
          { name: "bad", method: "GET", path: "//elsewhere.org" },
          "{}",
        ),
      ).toThrow();
      expect(() =>
        restRequest(
          { name: "get", method: "GET", path: "/api/v1/website/content/{id}" },
          '{"id":"../secrets"}',
        ),
      ).toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
