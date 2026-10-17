import { describe, expect, it, vi } from "vitest";
import { operations } from "../../src/integrations/automation/catalogue";
import {
  page,
  type AutomationContext,
} from "../../src/integrations/automation/operation";

// These are adapter-contract fixtures; no sessions or database are initialized.
vi.mock("../../src/core/config", () => ({
  config: { APP_URL: "http://127.0.0.1:3000" },
}));

describe("automation collection pagination", () => {
  it("preserves exact totals beyond 250 and ends pagination without inventing records", () => {
    const items = Array.from({ length: 327 }, (_, index) => index);
    expect(page(items, { offset: 300, limit: 20 })).toEqual({
      items: items.slice(300, 320),
      total: 327,
      offset: 300,
      limit: 20,
      nextOffset: 320,
    });
    expect(page(items, { offset: 320, limit: 20 })).toMatchObject({
      items: items.slice(320),
      total: 327,
      nextOffset: null,
    });
    expect(page(items, { offset: 340, limit: 20 })).toEqual({
      items: [],
      total: 327,
      offset: 340,
      limit: 20,
      nextOffset: null,
    });
  });

  it.each([
    "media_list",
    "files_list",
    "events_list",
    "forms_list",
    "projects_list",
    "directory_list",
  ])("%s forwards native pagination and its authorized total", async (name) => {
    const operation = operations.find((item) => item.name === name)!;
    // An empty read after counting can occur when another request removes records.
    // The adapter must preserve the service total, not infer it from this page.
    const query = vi.fn(async () => ({
      assets: [],
      events: [],
      forms: [],
      items: [],
      total: 327,
    }));
    const require = vi.fn(async () => ({ organizationId: "fixture" }));
    const context = {
      principal: {
        scopes: [operation.scope],
        organizationId: "fixture",
        actor: { userId: "fixture-user" },
      },
      services: {
        authorization: { require },
        media: { adminList: query },
        events: { query },
        forms: { collection: { list: query } },
        projects: { query },
        partners: { query },
      },
    } as unknown as AutomationContext;
    expect(await operation.run(context, { offset: 300, limit: 20 })).toEqual({
      items: [],
      total: 327,
      offset: 300,
      limit: 20,
      nextOffset: 320,
    });
    expect(require).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]).toEqual(
      expect.arrayContaining([
        context.principal.actor,
        expect.objectContaining({ offset: 300, pageSize: 20 }),
      ]),
    );
    query.mockClear();
    await expect(
      operation.run(
        { ...context, principal: { ...context.principal, scopes: [] } },
        { offset: 300, limit: 20 },
      ),
    ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
    expect(query).not.toHaveBeenCalled();
  });

  it("requires accurate metadata in every offset-based list contract", () => {
    for (const name of [
      "website_list",
      "media_list",
      "files_list",
      "events_list",
      "forms_list",
      "projects_list",
      "directory_list",
    ]) {
      const output = operations.find((item) => item.name === name)!.output;
      const result = {
        items: [],
        total: 0,
        offset: 0,
        limit: 20,
        nextOffset: null,
      };
      expect(output.safeParse(result).success, name).toBe(true);
      expect(
        output.safeParse({ ...result, total: undefined }).success,
        name,
      ).toBe(false);
      expect(output.safeParse({ ...result, total: -1 }).success, name).toBe(
        false,
      );
    }
  });
});
