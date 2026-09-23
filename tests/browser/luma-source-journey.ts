import { expect, type Page } from "@playwright/test";
import type { LumaSyncDto } from "../../src/integrations/luma/sync_schemas";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { runLocalTestJobs } from "./local-jobs";

/** B01 reuses package sources; private synthetic records never enter captures. */
export async function lumaSourceJourney(manager: Page, eventId: string) {
  const endpoint = `/api/admin/events/${eventId}/luma-api`;
  const initial = (await manager.request
    .get(endpoint)
    .then((response) => response.json())) as LumaSyncDto;
  const source = initial.sources.find(
    (item) => item.label === "Synthetic alternative checkout",
  )!;
  expect(initial.sourceId).toBeTruthy();
  expect(source?.enabled).toBe(true);
  expect(initial.count).toBe(2);
  const chooser = manager.getByRole("region", {
    name: "Luma booking source",
    exact: true,
  });
  const controls = manager.getByRole("region", {
    name: "Luma reconciliation controls",
    exact: true,
  });
  await chooser
    .getByRole("combobox", { name: "Booking source", exact: true })
    .selectOption(source.id);
  await expect(manager).toHaveURL(new RegExp(`sourceId=${source.id}`));
  await controls
    .getByLabel("Luma API event ID", { exact: true })
    .fill("evt-synthetic-alternative");
  await controls
    .getByRole("button", { name: "Review API event link", exact: true })
    .click();
  const review = manager.getByRole("dialog", {
    name: "Review Luma API event action",
    exact: true,
  });
  await expect(review.getByText(source.url, { exact: true })).toBeVisible();
  const confirm = async () => {
    await review
      .getByRole("checkbox", {
        name: "I confirm this event's API action.",
        exact: true,
      })
      .check();
    await review
      .getByRole("button", { name: "Confirm event API action", exact: true })
      .click();
    await expect(review).toHaveCount(0);
  };
  const linkRequest = manager.waitForRequest(
    (request) =>
      request.url().endsWith(`${endpoint}/link`) && request.method() === "POST",
  );
  await confirm();
  expect((await linkRequest).postDataJSON().sourceId).toBe(source.id);
  await expect(
    controls.getByText("evt-synthetic-alternative", { exact: true }),
  ).toBeVisible();
  await expect(
    controls.getByText("Complete · 2 provider records", { exact: true }),
  ).toHaveCount(0);
  const linked = (await manager.request
    .get(`${endpoint}?sourceId=${source.id}`)
    .then((response) => response.json())) as LumaSyncDto;
  expect(linked.count).toBe(0);
  expect(linked.jobs).toHaveLength(0);
  expect(linked.runs).toHaveLength(0);
  await controls
    .getByRole("button", { name: "Review guest reconciliation", exact: true })
    .click();
  await confirm();
  const result = await runLocalTestJobs(smokeOrigin, true);
  expect(
    result.find((item) => item.event === "luma_reconciliations_processed")
      ?.succeeded,
  ).toBe(1);
  await controls
    .getByRole("button", { name: "Refresh reconciliation status", exact: true })
    .click();
  await expect(
    controls.getByText("Complete · 1 provider record", { exact: true }),
  ).toBeVisible();
  const imported = (await manager.request
    .get(`${endpoint}?sourceId=${source.id}`)
    .then((response) => response.json())) as LumaSyncDto;
  expect(imported.sourceId).toBe(source.id);
  expect(imported.count).toBe(1);
  expect(imported.guests.map((guest) => guest.email)).toEqual([
    "synthetic-alternative@example.test",
  ]);
  const originalGuest = initial.guests.find(
    (guest) => guest.providerGuestId === imported.guests[0].providerGuestId,
  )!;
  expect(originalGuest).toBeTruthy();
  expect(imported.guests[0].id).not.toBe(originalGuest.id);
  expect(imported.jobs?.every((job) => job.sourceId === source.id)).toBe(true);
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 320],
  ] as const) {
    await manager.setViewportSize({ width, height: 1000 });
    expect(
      await manager.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await chooser.screenshot({
      path: `.local/luma-source-selector-${device}.png`,
    });
    await controls.screenshot({
      path: `.local/luma-source-history-${device}.png`,
    });
  }
  // A disabled source is still selectable, and cannot borrow another source's history.
  const disabledSource = initial.sources.find((item) => !item.enabled)!;
  expect(disabledSource).toBeTruthy();
  await chooser
    .getByRole("combobox", { name: "Booking source", exact: true })
    .selectOption(disabledSource.id);
  await manager
    .locator("summary")
    .filter({ hasText: /^Luma guest imports \(unavailable\)$/ })
    .click();
  await controls
    .getByLabel("Luma API event ID", { exact: true })
    .fill("evt-synthetic-alternative");
  await expect(
    controls.getByRole("button", {
      name: "Review API event link",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    controls.getByText("Complete · 1 provider record", { exact: true }),
  ).toHaveCount(0);

  // Explicit deep links restore selection; an absent source always resolves registration.
  await manager.goto(
    `/admin/events/${eventId}?tab=participation&sourceId=${source.id}`,
  );
  await expect(
    chooser.getByRole("combobox", { name: "Booking source", exact: true }),
  ).toHaveValue(source.id);
  await expect(
    controls.getByText("Complete · 1 provider record", { exact: true }),
  ).toBeVisible();
  await manager.goto(`/admin/events/${eventId}?tab=participation`);
  await expect(
    chooser.getByRole("combobox", { name: "Booking source", exact: true }),
  ).toHaveValue(initial.sourceId!);
  await expect(
    controls.getByText("Complete · 2 provider records", { exact: true }),
  ).toBeVisible();
  await expect(
    controls.getByText("Complete · 1 provider record", { exact: true }),
  ).toHaveCount(0);
  const retained = (await manager.request
    .get(endpoint)
    .then((response) => response.json())) as LumaSyncDto;
  expect(retained.sourceId).toBe(initial.sourceId);
  expect(retained.count).toBe(2);
  expect(retained.guests).toEqual(initial.guests);
  expect(retained.runs).toEqual(initial.runs);
  await manager.setViewportSize({ width: 1440, height: 1000 });
}
