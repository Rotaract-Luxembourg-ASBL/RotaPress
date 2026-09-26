import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";

const endpoint = "/api/admin/integrations/automation/availability";
export async function automationAvailabilityJourney(
  owner: Page,
  anonymous: APIRequestContext,
) {
  expect(
    (
      await anonymous.post(endpoint, {
        headers: { origin: smokeOrigin },
        data: {
          kind: "rest",
          enabled: true,
          expectedVersion: 0,
          confirmed: true,
        },
      })
    ).status(),
  ).toBe(401);
  expect((await anonymous.get("/api/v1/capabilities")).status()).toBe(409);
  expect((await anonymous.get("/api/mcp")).status()).toBe(409);
  await owner.goto("/admin/integrations");
  for (const name of ["REST API"]) {
    await owner
      .getByRole("button", { name: `Enable ${name}`, exact: true })
      .click();
    await owner
      .getByRole("button", { name: `Confirm enable ${name}`, exact: true })
      .click();
    await expect(
      owner.getByRole("button", { name: `Disable ${name}`, exact: true }),
    ).toBeVisible();
  }
  await owner.reload();
  await expect(
    owner.getByRole("button", { name: "Disable REST API", exact: true }),
  ).toBeVisible();
  await expect(
    owner.getByRole("button", { name: "Enable MCP", exact: true }),
  ).toBeVisible();
  await owner.setViewportSize({ width: 390, height: 844 });
  expect(
    await owner.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await owner.screenshot({
    path: ".local/automation-integrations-phone.png",
    fullPage: true,
  });
  await owner.setViewportSize({ width: 1440, height: 1000 });
}

export async function automationAvailabilityIsolation(
  owner: Page,
  api: APIRequestContext,
  key: string,
  mcpKey: string,
) {
  const headers = { authorization: `Bearer ${key}` };
  const states = (await (await owner.request.get(endpoint)).json()).items as {
    kind: "rest" | "mcp";
    version: number;
  }[];
  for (const state of states) {
    const input = {
      kind: state.kind,
      enabled: false,
      expectedVersion: state.version,
      confirmed: true,
    };
    expect(
      (
        await api.post(endpoint, {
          headers: { ...headers, origin: smokeOrigin },
          data: input,
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await owner.request.post(endpoint, {
          headers: { origin: "https://attacker.invalid" },
          data: input,
        })
      ).status(),
    ).toBe(403);
    const off = await owner.request.post(endpoint, {
      headers: { origin: smokeOrigin },
      data: input,
    });
    expect(off.status()).toBe(200);
    expect(
      (
        await owner.request.post(endpoint, {
          headers: { origin: smokeOrigin },
          data: input,
        })
      ).status(),
    ).toBe(409);
    expect((await api.get("/api/v1/capabilities", { headers })).status()).toBe(
      state.kind === "rest" ? 409 : 200,
    );
    expect(
      (
        await api.get("/api/mcp", {
          headers: { authorization: `Bearer ${mcpKey}` },
        })
      ).status(),
    ).toBe(state.kind === "mcp" ? 409 : 405);
    if (state.kind === "rest")
      expect(
        (
          await api.post("/api/v1/media/upload", {
            headers,
            data: "not-an-image",
          })
        ).status(),
      ).toBe(409);
    const on = await owner.request.post(endpoint, {
      headers: { origin: smokeOrigin },
      data: {
        ...input,
        enabled: true,
        expectedVersion: (await off.json()).version,
      },
    });
    expect(on.status()).toBe(200);
  }
}
