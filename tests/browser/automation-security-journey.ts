import { issueTransportPair } from "./automation-credentials";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { Pool } from "pg";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";

/** Uses library-issued keys and the owner's actual OTP session in the isolated smoke database. */
export async function automationSecurityJourney(
  owner: Page,
  api: APIRequestContext,
  database: Pool,
  key: string,
  mcpKey: string,
) {
  const bearer = { authorization: `Bearer ${key}` };
  const rpc = (name: string, args = {}) => ({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const mcpHeaders = {
    authorization: `Bearer ${mcpKey}`,
    accept: "application/json, text/event-stream",
  };
  for (const name of [
    "website_publish",
    "members_list",
    "credentials_read",
    "__proto__",
  ]) {
    const rejected = await api.post("/api/mcp", {
      headers: mcpHeaders,
      data: rpc(name),
    });
    expect(rejected.status()).toBe(200);
    const result = (await rejected.json()).result;
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({
          error:
            name === "website_publish"
              ? "This connection needs website:publish."
              : "This operation is unavailable.",
        }),
      },
    ]);
  }
  expect(
    (
      await owner.request.post("/api/mcp", {
        data: rpc("automation_capabilities"),
      })
    ).status(),
  ).toBe(401);
  for (const path of ["/api/v1/capabilities", "/api/mcp"]) {
    const method = path.endsWith("mcp") ? "POST" : "GET";
    const data = method === "POST" ? rpc("automation_capabilities") : undefined;
    const deniedHeaders: Record<string, string>[] = [
      { origin: "null" },
      { host: "untrusted.invalid" },
      { "sec-fetch-site": "cross-site" },
    ];
    for (const extra of deniedHeaders)
      expect(
        (
          await api.fetch(path, {
            method,
            headers: { ...mcpHeaders, ...extra },
            data,
          })
        ).status(),
      ).toBe(403);
  }
  expect(
    (
      await api.post("/api/mcp", {
        headers: { ...mcpHeaders, "content-type": "text/plain" },
        data: "{}",
      })
    ).status(),
  ).toBe(415);
  expect(
    (
      await api.post("/api/mcp", {
        headers: mcpHeaders,
        data: { padding: "x".repeat(262144) },
      })
    ).status(),
  ).toBe(413);
  expect(
    (
      await api.post("/api/v1/imports", {
        headers: bearer,
        data: { padding: "x".repeat(262144) },
      })
    ).status(),
  ).toBe(413);
  expect(
    (
      await api.get("/api/v1/website/content?limit=1&limit=2", {
        headers: bearer,
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await owner.request.post("/api/admin/integrations/automation", {
        headers: { origin: smokeOrigin },
        data: {
          name: "Invalid escalation",
          scopes: ["website:read"],
          userId: "someone-else",
          organizationId: "someone-else",
        },
      })
    ).status(),
  ).toBe(400);

  const { rest: connection, mcp } = await issueTransportPair(owner, {
    name: "Synthetic contract coverage",
    scopes: [
      "forms:read",
      "forms:write",
      "events:read",
      "events:write",
      "directory:read",
      "directory:write",
      "calendar:read",
      "media:read",
    ],
  });
  const headers = { authorization: `Bearer ${connection.key}` };
  try {
    for (const path of ["forms", "events", "directory", "media", "calendar"])
      expect(
        (await api.get(`/api/v1/${path}`, { headers })).status(),
        path,
      ).toBe(200);
    const formResponse = await api.post("/api/v1/forms", {
      headers,
      data: { kind: "contact", title: "API contract contact" },
    });
    expect(formResponse.status()).toBe(200);
    const form = (await formResponse.json()).data;
    expect(form.publishedVersionId).toBeNull();
    expect(form).not.toHaveProperty("responses");
    expect(form).not.toHaveProperty("recipients");
    expect(
      (
        await api.patch(`/api/v1/forms/${form.id}`, {
          headers,
          data: {
            expectedRevision: form.draftRevision,
            definition: { ...form.draft, title: "Updated API contact" },
          },
        })
      ).status(),
    ).toBe(200);
    const eventInput = {
      title: "API draft event",
      description: "Synthetic content",
      startsAt: "2030-06-15T10:00:00Z",
      endsAt: null,
      timezone: "Europe/Luxembourg",
      venue: "To be confirmed",
      visibility: "private",
    };
    const eventResponse = await api.post("/api/v1/events", {
      headers,
      data: eventInput,
    });
    expect(eventResponse.status()).toBe(200);
    const event = (await eventResponse.json()).data;
    expect(event.published).toBe(false);
    expect(event).not.toHaveProperty("manager");
    expect(
      (
        await api.patch(`/api/v1/events/${event.id}`, {
          headers,
          data: {
            ...eventInput,
            title: "Updated API draft event",
            expectedVersion: event.version,
          },
        })
      ).status(),
    ).toBe(200);
    const profile = {
      name: "API draft partner",
      category: "partner",
      description: "Synthetic profile",
      website: "",
      logoId: null,
    };
    const directoryResponse = await api.post("/api/v1/directory", {
      headers,
      data: profile,
    });
    expect(directoryResponse.status()).toBe(200);
    const partner = (await directoryResponse.json()).data;
    expect(partner.published).toBeNull();
    expect(
      (
        await api.patch(`/api/v1/directory/${partner.id}`, {
          headers,
          data: {
            expectedVersion: partner.version,
            profile: { ...profile, name: "Updated API partner" },
          },
        })
      ).status(),
    ).toBe(200);
    const linked = await database.query(
      "SELECT reference_id FROM club.apikey WHERE id=$1",
      [connection.id],
    );
    const userId = linked.rows[0].reference_id;
    const membership = await database.query(
      "SELECT id, role FROM club.membership WHERE user_id=$1 AND role='owner'",
      [userId],
    );
    expect(membership.rows.length).toBe(1);
    const current = membership.rows[0];
    try {
      await database.query(
        "UPDATE club.membership SET role='editor' WHERE id=$1",
        [current.id],
      );
      expect((await api.get("/api/v1/events", { headers })).status()).toBe(403);
      const denied = await api.post("/api/mcp", {
        headers: {
          authorization: `Bearer ${mcp.key}`,
          accept: "application/json, text/event-stream",
        },
        data: rpc("events_list"),
      });
      expect((await denied.json()).result.isError).toBe(true);
      expect(
        (
          await owner.request.post("/api/admin/integrations/automation", {
            headers: { origin: smokeOrigin },
            data: { name: "Forbidden renewal", scopes: ["website:read"] },
          })
        ).status(),
      ).toBe(403);
    } finally {
      await database.query("UPDATE club.membership SET role=$2 WHERE id=$1", [
        current.id,
        current.role,
      ]);
    }
  } finally {
    await owner.request.delete("/api/admin/integrations/automation", {
      headers: { origin: smokeOrigin },
      data: { id: mcp.id },
    });
    expect(
      (
        await owner.request.delete("/api/admin/integrations/automation", {
          headers: { origin: smokeOrigin },
          data: { id: connection.id },
        })
      ).status(),
    ).toBe(200);
  }
}
