import { randomUUID } from "node:crypto";
import { expect, type Page, type Browser } from "@playwright/test";
import { smokeOrigin as origin } from "../../scripts/smoke_origin.mjs";
import { eventLayoutJourney } from "./event-layout-journey";

/** B01 continuation using its existing real OTP sessions and synthetic records. */
export async function eventTemplateJourney(
  owner: Page,
  manager: Page,
  browser: Browser,
  sourceId: string,
) {
  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  async function create(
    title: string,
    selection: string,
    screenshots = false,
    expectedForms = 1,
  ) {
    await owner.goto("/admin/events");
    await owner.getByRole("button", { name: "New event", exact: true }).click();
    const dialog = owner.getByRole("dialog", { name: "New event draft" });
    if (screenshots) {
      await dialog.getByRole("button", { name: "Next", exact: true }).click();
      await expect(
        dialog.getByRole("heading", { name: "Basics", exact: true }),
      ).toBeVisible();
    }
    await dialog.getByLabel("Event name", { exact: true }).fill(title);
    if (screenshots) {
      for (const [device, width] of [
        ["desktop", 1440],
        ["phone", 390],
      ] as const) {
        await owner.setViewportSize({ width, height: 1000 });
        expect(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        await dialog.screenshot({
          path: `.local/event-create-basics-${device}.png`,
        });
      }
    }
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    if (screenshots) {
      await dialog.getByRole("button", { name: "Next", exact: true }).click();
      await expect(
        dialog.getByRole("heading", {
          name: "Schedule & location",
          exact: true,
        }),
      ).toBeVisible();
    }
    await dialog
      .getByLabel("Start time", { exact: true })
      .fill("2026-12-15T18:00");
    if (screenshots) {
      await dialog
        .getByLabel("End time (optional)", { exact: true })
        .fill("2026-12-15T17:00");
      await dialog.getByRole("button", { name: "Next", exact: true }).click();
      await expect(
        dialog.getByText("The end must be after the start.", { exact: true }),
      ).toBeVisible();
      await dialog.getByLabel("End time (optional)", { exact: true }).fill("");
    }
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await dialog
      .getByRole("combobox", { name: "Starting setup", exact: true })
      .selectOption(selection);
    if (screenshots) {
      await dialog.getByRole("button", { name: "Back", exact: true }).click();
      await expect(
        dialog.getByLabel("Start time", { exact: true }),
      ).toHaveValue("2026-12-15T18:00");
      await dialog.getByRole("button", { name: "Back", exact: true }).click();
      await expect(
        dialog.getByLabel("Event name", { exact: true }),
      ).toHaveValue(title);
      await dialog.getByRole("button", { name: "Next", exact: true }).click();
      await dialog.getByRole("button", { name: "Next", exact: true }).click();
      await expect(
        dialog.getByRole("combobox", { name: "Starting setup", exact: true }),
      ).toHaveValue(selection);
      for (const [device, width] of [
        ["desktop", 1440],
        ["phone", 390],
      ] as const) {
        await owner.setViewportSize({ width, height: 1000 });
        expect(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        await dialog.screenshot({
          path: `.local/event-create-setup-${device}.png`,
        });
      }
    }
    await dialog
      .getByRole("button", { name: "Review event setup", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", { name: "Review event setup" }),
    ).toBeVisible();
    const confirm = dialog.getByRole("button", {
      name: "Confirm features and create draft",
      exact: true,
    });
    await expect(confirm).toBeDisabled();
    const events = (await owner.request
      .get("/api/admin/events")
      .then((r) => r.json())) as { events: { title: string }[] };
    expect(events.events.some((e) => e.title === title)).toBe(false);
    if (screenshots) {
      for (const [device, width] of [
        ["desktop", 1440],
        ["phone", 390],
      ] as const) {
        await owner.setViewportSize({ width, height: 1000 });
        await dialog.evaluate((el) => el.scrollTo(0, 0));
        expect(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        await dialog.screenshot({
          path: `.local/event-template-${device}.png`,
        });
      }
    }
    await dialog
      .getByRole("checkbox", {
        name: "Enable the listed features and create this private draft.",
        exact: true,
      })
      .check();
    await confirm.click();
    await expect(owner).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}$/);
    const id = new URL(owner.url()).pathname.split("/").at(-1)!;
    expect(
      (await visitor.request.get(`${origin}/events/${id}/en/website`)).status(),
    ).toBe(404);
    const config = (await owner.request
      .get(`/api/admin/events/${id}/registration`)
      .then((r) => r.json())) as { open: boolean; confirmedCount: number };
    expect(config.open).toBe(false);
    expect(config.confirmedCount).toBe(0);
    const forms = (await owner.request
      .get(`/api/admin/events/${id}/forms`)
      .then((r) => r.json())) as {
      forms: { publishedVersionId: string | null }[];
    };
    expect(forms.forms).toHaveLength(expectedForms);
    expect(forms.forms.every((form) => form.publishedVersionId === null)).toBe(
      true,
    );
    return id;
  }
  await owner.setViewportSize({ width: 1440, height: 1000 });
  const presetId = await create(
    "Synthetic networking starting copy",
    "networking",
    true,
  );
  await eventLayoutJourney(owner, visitor, presetId);
  expect(
    (await manager.request.get(`/api/admin/events/${presetId}`)).status(),
  ).toBe(404);
  await create(
    "Synthetic copied community event",
    `copy:${sourceId}`,
    false,
    2,
  );
  expect(
    (
      await visitor.request.get(`${origin}/events/${sourceId}/en/website`)
    ).status(),
  ).toBe(200);

  // Book a real test place so cancellation reviews and changes an actual count.
  await owner.goto(`/events/${sourceId}/en/registration`);
  await owner
    .getByRole("textbox", { name: "Your name", exact: false })
    .fill("Synthetic cancellation registrant");
  await owner.getByRole("button", { name: "Register", exact: true }).click();
  await expect(
    owner.getByText("Your place is confirmed.", { exact: true }),
  ).toBeVisible();
  await manager.goto(`/admin/events/${sourceId}`);
  await manager.getByLabel("Event actions", { exact: true }).click();
  await manager
    .getByRole("button", { name: "Review event cancellation", exact: true })
    .click();
  const cancellation = manager.getByRole("dialog", {
    name: "Review event cancellation",
    exact: true,
  });
  await expect(
    cancellation.getByText("1 confirmed registration", { exact: true }),
  ).toBeVisible();
  await expect(
    cancellation.getByRole("button", {
      name: "Confirm event cancellation",
      exact: true,
    }),
  ).toBeDisabled();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await manager.setViewportSize({ width, height: 844 });
    await cancellation.evaluate((el) => el.scrollTo(0, 0));
    expect(
      await cancellation.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await cancellation.screenshot({
      path: `.local/event-cancellation-${device}.png`,
    });
  }
  await cancellation
    .getByRole("checkbox", {
      name: "I confirm the event and listed registrations should be cancelled.",
      exact: true,
    })
    .check();
  await cancellation
    .getByRole("button", { name: "Confirm event cancellation", exact: true })
    .click();
  await expect(cancellation).toHaveCount(0);
  await expect(
    manager.getByLabel("Event name", { exact: true }),
  ).toBeDisabled();
  await owner.goto("/registrations");
  await expect(
    owner.getByRole("button", { name: "Cancel registration", exact: true }),
  ).toHaveCount(0);
  await visitor.goto(`${origin}/events/${sourceId}/en/registration`);
  await expect(
    visitor.getByText(
      "This event is cancelled. Registration and event forms on this website are closed.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    visitor.getByRole("button", { name: "Register", exact: true }),
  ).toHaveCount(0);
  await expect(
    visitor
      .getByRole("navigation", { name: "Event navigation" })
      .getByRole("link", { name: "Registration", exact: true }),
  ).toHaveCount(0);
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await visitor.setViewportSize({ width, height: 844 });
    expect(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await visitor.screenshot({
      path: `.local/event-cancelled-public-${device}.png`,
      fullPage: true,
    });
  }
  expect(
    (
      await owner.request.post(`/api/events/${sourceId}/registration`, {
        headers: { origin },
        data: {
          versionId: randomUUID(),
          requestId: randomUUID(),
          answers: { name: "Synthetic closed registration" },
        },
      })
    ).status(),
  ).toBe(404);
  await anonymous.close();
}
