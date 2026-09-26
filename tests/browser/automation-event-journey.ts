import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { eventExample } from "../../src/integrations/automation/examples";

/** Real HTTP/MCP + staff review: private native event and closed registration. */
export async function automationEventJourney(
  owner: Page,
  api: APIRequestContext,
) {
  const issued = await owner.request.post(
    "/api/admin/integrations/automation",
    {
      headers: { origin: smokeOrigin },
      data: {
        name: "Synthetic event assistant",
        scopes: [
          "events:read",
          "events:write",
          "events:prepare",
          "website:read",
          "website:write",
          "forms:read",
          "forms:write",
        ],
      },
    },
  );
  expect(issued.status()).toBe(200);
  const connection = (await issued.json()) as { id: string; key: string };
  const headers = { authorization: `Bearer ${connection.key}` };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const response = await api.post("/api/mcp", {
      headers: { ...headers, accept: "application/json, text/event-stream" },
      data: {
        jsonrpc: "2.0",
        id: 47,
        method: "tools/call",
        params: { name, arguments: args },
      },
    });
    expect(response.status()).toBe(200);
    return (await response.json()).result;
  };
  try {
    const design = await api.get("/api/v1/website/design", { headers });
    expect(design.status()).toBe(200);
    expect(JSON.stringify((await design.json()).data)).not.toContain(
      '"CustomCode"',
    );
    const blueprint = await api.get("/api/v1/events/blueprints", { headers });
    expect(blueprint.status()).toBe(200);
    const input = {
      event: {
        ...eventExample,
        title: `Synthetic AI event ${randomUUID().slice(0, 8)}`,
      },
      template: {
        kind: "preset",
        id: "networking",
        selectedModules: ["website", "forms", "registration", "prizes"],
      },
    };
    const review = await api.post("/api/v1/events/preparation/preview", {
      headers,
      data: input,
    });
    expect(review.status(), await review.text()).toBe(200);
    const create = {
      ...input,
      requestId: randomUUID(),
      reviewToken: (await review.json()).data.token,
    };
    const prepared = await api.post("/api/v1/events/preparation", {
      headers,
      data: create,
    });
    expect(prepared.status(), await prepared.text()).toBe(200);
    const event = (await prepared.json()).data;
    expect(event.event.published).toBe(false);
    expect(event.pages.length).toBeGreaterThan(0);
    expect(event.forms).toHaveLength(1);
    const retry = await rpc("events_prepare", create);
    expect(retry.isError).toBe(false);
    expect(retry.structuredContent.data).toEqual(event);
    const workspacePath = `/api/v1/events/${event.event.id}/preparation`;
    const workspace = (await (await api.get(workspacePath, { headers })).json())
      .data;
    expect(workspace.registration).toMatchObject({
      authority: "native",
      open: false,
    });
    expect(workspace.registration).not.toHaveProperty("confirmedCount");
    expect(workspace.publication).toBe("manual-only");
    expect((await api.get(`/events/${event.event.slug}`)).status()).toBe(404);
    const packages = await rpc("events_package_save", {
      eventId: event.event.id,
      expectedVersion: 0,
      sourceId: null,
      draft: {
        title: "Synthetic dinner",
        description: "Draft only",
        priceMinor: 0,
        currency: "EUR",
        showPrice: false,
        checkoutEnabled: false,
        position: 0,
      },
    });
    expect(packages.isError).toBe(false);
    expect(packages.structuredContent.data.items[0].published).toBe(false);
    const prize = await rpc("events_prize_save", {
      eventId: event.event.id,
      expectedVersion: 0,
      draft: {
        title: "Synthetic prize",
        description: "Draft only",
        imageId: null,
        alt: "",
        quantity: 1,
        position: 0,
        partnerId: null,
      },
    });
    expect(prize.isError).toBe(false);
    expect(prize.structuredContent.data.published).toBe(false);
    expect(
      (await rpc("events_apply_settings", { confirmed: true })).isError,
    ).toBe(true);
    const proposalInput = {
      eventId: event.event.id,
      requestId: randomUUID(),
      proposal: {
        kind: "registration",
        settings: {
          expectedVersion: workspace.registration.version,
          authority: "native",
          formId: event.forms[0].id,
          capacity: 80,
          open: false,
        },
      },
    };
    const response = await api.post("/api/v1/events/proposals", {
      headers,
      data: proposalInput,
    });
    expect(response.status(), await response.text()).toBe(200);
    const proposal = (await response.json()).data;
    expect(proposal.status).toBe("pending");
    expect(
      (await (await api.get(workspacePath, { headers })).json()).data
        .registration.capacity,
    ).toBeNull();
    expect(
      (
        await api.post("/api/admin/integrations/automation/proposals", {
          headers: { ...headers, origin: smokeOrigin },
          data: { id: proposal.id, action: "apply", confirmed: true },
        })
      ).status(),
    ).toBe(401);
    const previousViewport = owner.viewportSize();
    await owner.goto(proposal.reviewUrl);
    await expect(
      owner.getByRole("heading", {
        name: "Review event suggestions",
        exact: true,
      }),
    ).toBeVisible();
    await owner.setViewportSize({ width: 390, height: 844 });
    expect(
      await owner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await owner.screenshot({
      path: ".local/automation-proposal-phone.png",
      fullPage: true,
    });
    if (previousViewport) await owner.setViewportSize(previousViewport);
    await owner
      .getByRole("button", { name: "Review and apply", exact: true })
      .click();
    await owner
      .getByRole("button", { name: "Apply reviewed settings", exact: true })
      .click();
    await expect(
      owner.getByText(
        "The reviewed settings were applied. Content publication is unchanged.",
        { exact: true },
      ),
    ).toBeVisible();
    const applied = (await (await api.get(workspacePath, { headers })).json())
      .data;
    expect(applied.registration).toMatchObject({ capacity: 80, open: false });
    expect(applied.event.event.published).toBe(false);
  } finally {
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
