import { randomUUID } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Pool } from "pg";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { automationDocsJourney } from "./automation-docs-journey";
import { automationSecurityJourney } from "./automation-security-journey";
import { automationMediaJourney } from "./automation-media-journey";
import { automationEventJourney } from "./automation-event-journey";
import {
  automationAvailabilityJourney,
  automationAvailabilityIsolation,
} from "./automation-availability-journey";
import { integrationCredentialsJourney } from "./integration-credentials-journey";
import { oauthJourney } from "./oauth-journey";

/** Real Better Auth OTP session and scoped key; all source/page text is synthetic. */
export async function automationJourney(
  owner: Page,
  browser: Browser,
  database: Pool,
) {
  const endpoint = "/api/admin/integrations/automation";
  const anonymous = await browser.newContext();
  await automationAvailabilityJourney(owner, anonymous.request);
  const {
    rest: { id, key },
    mcp,
  } = await integrationCredentialsJourney(owner);
  const mcpBearer = { authorization: `Bearer ${mcp.key}` };
  const bearer = { authorization: `Bearer ${key}` };
  const api = anonymous.request;
  const client = new Client({
    name: "rotapress-local-check",
    version: "1.0.0",
  });
  try {
    expect((await api.get(endpoint)).status()).toBe(401);
    expect((await owner.request.get("/api/v1/capabilities")).status()).toBe(
      401,
    ); // Cookie alone cannot authorize automation.
    const persisted = await database.query(
      "SELECT key, metadata, permissions FROM club.apikey WHERE id=$1",
      [id],
    );
    expect(persisted.rows.length === 1 && persisted.rows[0].key !== key).toBe(
      true,
    );
    const listed = await owner.request.get(endpoint);
    expect((await listed.text()).includes(key)).toBe(false);
    expect(
      (
        await owner.request.post("/api/auth/api-key/create", {
          headers: { origin: smokeOrigin },
          data: { name: "Unrestricted" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await owner.request.post("/api/auth/api-key/update", {
          headers: { origin: smokeOrigin },
          data: { keyId: id, permissions: { automation: ["website:publish"] } },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await api.get("/api/v1/capabilities", {
          headers: { ...bearer, origin: "https://untrusted.org" },
        })
      ).status(),
    ).toBe(403);
    const capabilities = await api.get("/api/v1/capabilities", {
      headers: bearer,
    });
    expect(capabilities.status()).toBe(200);
    expect(capabilities.headers()["cache-control"]).toContain("no-store");
    const catalogue = (await capabilities.json()).data;
    expect(catalogue.publication).toBe("manual-only");
    expect(
      catalogue.operations.some((o: { name: string }) =>
        o.name.includes("publish"),
      ),
    ).toBe(false);
    expect((await api.get("/api/v1/forms", { headers: bearer })).status()).toBe(
      403,
    );
    expect(
      (
        await api.post("/api/mcp", {
          headers: {
            ...mcpBearer,
            accept: "application/json, text/event-stream",
          },
          data: [
            { jsonrpc: "2.0", id: 1, method: "tools/list" },
            { jsonrpc: "2.0", id: 2, method: "tools/list" },
          ],
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await api.post("/api/v1/sources/read", {
          headers: bearer,
          data: { url: "https://unapproved.org/page" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await api.get("/api/v1/openapi.json", { headers: bearer })).status(),
    ).toBe(200);
    const input = {
      requestId: randomUUID(),
      pages: [
        {
          title: "AI review fixture",
          slug: "ai-review-fixture",
          locale: "en",
          sourceUrl: "https://www.rotary.org/",
          sections: [
            {
              heading: "Our community",
              text: "Synthetic content for local review only.",
            },
          ],
        },
      ],
    };
    const imported = await api.post("/api/v1/imports", {
      headers: bearer,
      data: input,
    });
    expect(imported.status()).toBe(200);
    const receipt = (await imported.json()).data;
    const repeated = await api.post("/api/v1/imports", {
      headers: bearer,
      data: input,
    });
    expect((await repeated.json()).data).toEqual(receipt);
    expect(
      (
        await api.post("/api/v1/imports", {
          headers: bearer,
          data: { ...input, pages: [{ ...input.pages[0], title: "Changed" }] },
        })
      ).status(),
    ).toBe(409);
    const pageId = receipt.pages[0].id;
    const draft = (
      await (
        await api.get(`/api/v1/website/content/${pageId}?locale=en`, {
          headers: bearer,
        })
      ).json()
    ).data;
    expect(draft.publishedRevisionId).toBeNull();
    expect((await api.get("/pages/en/ai-review-fixture")).status()).toBe(404);
    expect(
      (
        await api.post(`/api/v1/website/content/${pageId}/publish`, {
          headers: bearer,
          data: {},
        })
      ).status(),
    ).toBe(404);
    const edit = {
      locale: "en",
      expectedRevisionId: draft.draft.id,
      title: "Reviewed draft",
      slug: "ai-review-fixture",
      description: "",
      socialImageId: null,
      data: draft.draft.data,
    };
    const executable = {
      ...edit,
      data: {
        root: { props: {} },
        content: [
          {
            type: "CustomCode",
            props: {
              id: "unsafe",
              version: 1,
              title: "Blocked code",
              html: "",
              css: "",
              javascript: "alert(1)",
              height: 200,
            },
          },
        ],
      },
    };
    expect(
      (
        await api.patch(`/api/v1/website/content/${pageId}`, {
          headers: bearer,
          data: executable,
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await api.patch(`/api/v1/website/content/${pageId}`, {
          headers: bearer,
          data: edit,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await api.patch(`/api/v1/website/content/${pageId}`, {
          headers: bearer,
          data: edit,
        })
      ).status(),
    ).toBe(409);
    await owner.goto(receipt.pages[0].reviewUrl);
    await expect(
      owner.getByRole("button", { name: "Save draft", exact: true }),
    ).toBeVisible();

    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${smokeOrigin}/api/mcp`), {
        requestInit: { headers: mcpBearer },
      }),
    );
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
      catalogue.operations.map((o: { name: string }) => o.name).sort(),
    );
    const retry = await client.callTool({
      name: "content_import",
      arguments: input,
    });
    expect(retry.isError).toBe(false);
    expect(retry.structuredContent).toEqual({ data: receipt });
    expect(
      (await client.callTool({ name: "forms_list", arguments: {} })).isError,
    ).toBe(true);
    expect(
      (await client.callTool({ name: "website_publish", arguments: {} }))
        .isError,
    ).toBe(true);
    expect(
      (await client.readResource({ uri: "rotapress://capabilities" })).contents
        .length,
    ).toBe(1);
    expect(
      (
        await client.getPrompt({
          name: "adapt_reference_website",
          arguments: {
            sourceUrl: "https://www.rotary.org/",
            brief: "Adapt our About page.",
          },
        })
      ).messages[0].content.type,
    ).toBe("text");

    const bridge = new Client({
      name: "rotapress-bridge-check",
      version: "1.0.0",
    });
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        (item): item is [string, string] => typeof item[1] === "string",
      ),
    );
    try {
      await bridge.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: ["scripts/mcp_bridge.mjs"],
          env: {
            ...environment,
            ROTAPRESS_MCP_URL: `${smokeOrigin}/api/mcp`,
            ROTAPRESS_MCP_KEY: mcp.key,
          },
          stderr: "pipe",
        }),
      );
      expect((await bridge.listTools()).tools.length).toBe(tools.tools.length);
    } finally {
      await bridge.close();
    }

    await automationAvailabilityIsolation(owner, api, key, mcp.key);
    await automationMediaJourney(owner, api, key);
    await automationEventJourney(owner, api);
    await oauthJourney(owner, browser, database);
    await automationDocsJourney(owner, key, mcp.key);
    await automationSecurityJourney(owner, api, database, key, mcp.key);
    await database.query(
      "UPDATE club.apikey SET request_count=120, last_request=now() WHERE id=$1",
      [id],
    );
    expect(
      (await api.get("/api/v1/capabilities", { headers: bearer })).status(),
    ).toBe(429);
    await database.query("UPDATE club.apikey SET request_count=0 WHERE id=$1", [
      id,
    ]);
    const binding = JSON.parse(persisted.rows[0].metadata);
    const metadata =
      typeof binding === "string" ? JSON.parse(binding) : binding;
    const parent = await database.query(
      "SELECT expires_at, user_id FROM club.session WHERE id=$1",
      [metadata.sessionId],
    );
    await database.query(
      "UPDATE club.session SET expires_at=now()-interval '1 second' WHERE id=$1",
      [metadata.sessionId],
    );
    expect(
      (await api.get("/api/v1/capabilities", { headers: bearer })).status(),
    ).toBe(401);
    await database.query("UPDATE club.session SET expires_at=$2 WHERE id=$1", [
      metadata.sessionId,
      parent.rows[0].expires_at,
    ]);
    await database.query(
      "UPDATE club.membership SET status='suspended' WHERE user_id=$1",
      [parent.rows[0].user_id],
    );
    expect(
      (await api.get("/api/v1/capabilities", { headers: bearer })).status(),
    ).toBe(403);
    await database.query(
      "UPDATE club.membership SET status='approved' WHERE user_id=$1",
      [parent.rows[0].user_id],
    );
    await database.query(
      "UPDATE club.organization SET staff_auth_policy='google' WHERE id=$1",
      [metadata.organizationId],
    );
    try {
      // Google-only rejects the parent email session before checking staff permissions.
      expect(
        (await api.get("/api/v1/capabilities", { headers: bearer })).status(),
      ).toBe(401);
    } finally {
      await database.query(
        "UPDATE club.organization SET staff_auth_policy='email-or-google' WHERE id=$1",
        [metadata.organizationId],
      );
    }
    await owner.goto("/admin/integrations/rest");
    await owner
      .getByRole("button", {
        name: "Revoke Synthetic REST script",
        exact: true,
      })
      .click();
    await expect(
      owner.getByText("Revoked Synthetic REST script.", { exact: true }),
    ).toBeVisible();
    expect(
      (await api.get("/api/v1/capabilities", { headers: bearer })).status(),
    ).toBe(401);
  } finally {
    await owner.request.delete(endpoint, {
      headers: { origin: smokeOrigin },
      data: { id: mcp.id },
    });
    await client.close();
    await anonymous.close();
  }
}
