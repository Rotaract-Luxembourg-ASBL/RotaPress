import { expect, type Page, type Browser } from "@playwright/test";
import { smokeOrigin as origin } from "../../scripts/smoke_origin.mjs";
import { lumaConnectionJourney } from "./luma-connection-journey";
import { eventPackagesJourney } from "./event-packages-journey";
import type { SignInGuest } from "./guest-access-journey";

/** B01 continuation. Synthetic destination links are never followed. */
export async function eventLumaJourney(
  owner: Page,
  manager: Page,
  browser: Browser,
  returnEventId: string,
  managerEmail: string,
  signIn: SignInGuest,
) {
  const context = await browser.newContext();
  const visitor = await context.newPage();
  const destination = "https://luma.com/rotapress-synthetic-browser-event";
  let providerRequests = 0;
  const contexts = [context, owner.context(), manager.context()];
  for (const current of contexts)
    await current.route(/^https:\/\/(luma\.com|lu\.ma)\//, (route) => {
      providerRequests++;
      return route.abort();
    });
  await owner.goto("/admin/events");
  await owner.getByRole("button", { name: "New event", exact: true }).click();
  const create = owner.getByRole("dialog", {
    name: "New event draft",
    exact: true,
  });
  await create
    .getByRole("textbox", { name: "Event name", exact: true })
    .fill("Synthetic Luma gathering");
  await create
    .getByRole("combobox", { name: "Visibility when published", exact: true })
    .selectOption("public");
  await create
    .getByRole("combobox", { name: "Responsible manager", exact: true })
    .selectOption({ label: managerEmail });
  await create.getByRole("button", { name: "Next", exact: true }).click();
  await create
    .getByLabel("Start time", { exact: true })
    .fill("2026-12-20T18:00");
  await create.getByRole("button", { name: "Next", exact: true }).click();
  await create
    .getByRole("combobox", { name: "Starting setup", exact: true })
    .selectOption("simple");
  await create
    .getByRole("button", { name: "Review event setup", exact: true })
    .click();
  await create
    .getByRole("checkbox", {
      name: "Enable the listed features and create this private draft.",
      exact: true,
    })
    .check();
  await create
    .getByRole("button", {
      name: "Confirm features and create draft",
      exact: true,
    })
    .click();
  await expect(owner).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}$/);
  const id = new URL(owner.url()).pathname.split("/").at(-1)!;
  const url = `${origin}/events/${id}/en/registration`;
  await manager.setViewportSize({ width: 1440, height: 1000 });
  await manager.goto(`/admin/events/${id}?tab=participation`);
  const participation = manager.getByRole("region", {
    name: "Event forms and registration",
    exact: true,
  });
  manager.once("dialog", (d) => d.accept());
  await participation
    .getByRole("button", { name: "Enable Registration", exact: true })
    .click();
  await expect(
    participation.getByRole("button", { name: "Enable Forms", exact: true }),
  ).toBeVisible();
  const link = manager.getByRole("region", {
    name: "Luma registration link",
    exact: true,
  });
  // An unused disabled integration is absent from the event workspace.
  await expect(link).toHaveCount(0);
  await expect(
    manager.getByRole("textbox", { name: "Luma event URL", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await visitor.request.get(`${origin}/api/admin/events/${id}/luma`)
    ).status(),
  ).toBe(401);
  expect(
    (await manager.request.get("/api/admin/integrations/luma")).status(),
  ).toBe(403);
  expect((await visitor.request.get(url)).status()).toBe(404);
  await owner.goto("/admin/integrations");
  const availability = owner.getByRole("article", {
    name: "Luma",
    exact: true,
  });
  await availability
    .getByRole("button", { name: "Enable Luma", exact: true })
    .click();
  const review = owner.getByRole("dialog", {
    name: "Review Luma availability",
    exact: true,
  });
  await expect(
    review.getByRole("button", {
      name: "Confirm Luma availability",
      exact: true,
    }),
  ).toBeDisabled();
  // Opening the enable review alone never changes server availability.
  expect(
    (
      await owner.request
        .get("/api/admin/integrations/luma")
        .then((r) => r.json())
    ).enabled,
  ).toBe(false);
  await review
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(
    availability.getByRole("button", { name: "Enable Luma", exact: true }),
  ).toBeFocused();
  await availability
    .getByRole("button", { name: "Enable Luma", exact: true })
    .click();
  await review
    .getByRole("checkbox", {
      name: "I confirm this availability change for the club.",
      exact: true,
    })
    .check();
  await review
    .getByRole("button", { name: "Confirm Luma availability", exact: true })
    .click();
  await expect(
    availability.getByText("Enabled", { exact: true }),
  ).toBeVisible();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await owner.setViewportSize({ width, height: 1000 });
    expect(
      await owner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await availability.screenshot({
      path: `.local/luma-settings-${device}.png`,
    });
  }
  await manager.reload();
  await expect(link).toBeVisible();
  await link
    .getByRole("textbox", { name: "Luma event URL", exact: true })
    .fill(destination);
  await link
    .getByRole("button", { name: "Save Luma link draft", exact: true })
    .click();
  await expect(
    link.getByRole("button", { name: "Save Luma link draft", exact: true }),
  ).toBeDisabled();
  await link
    .getByRole("button", { name: "Preview saved Luma link", exact: true })
    .click();
  const preview = manager.getByRole("dialog", {
    name: "Saved Luma link preview",
    exact: true,
  });
  await expect(
    preview.getByRole("button", { name: "Continue to Luma", exact: true }),
  ).toBeDisabled();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await manager.setViewportSize({ width, height: 1000 });
    if (device === "phone")
      await preview
        .getByRole("button", { name: "Phone preview", exact: true })
        .click();
    expect(
      await preview.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await preview.screenshot({ path: `.local/luma-preview-${device}.png` });
  }
  await preview
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await link
    .getByRole("button", { name: "Review Luma link publication", exact: true })
    .click();
  const publication = manager.getByRole("dialog", {
    name: "Review Luma link publication",
    exact: true,
  });
  await expect(
    publication.getByRole("button", {
      name: "Confirm Luma link change",
      exact: true,
    }),
  ).toBeDisabled();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await manager.setViewportSize({ width, height: 1000 });
    await publication.screenshot({
      path: `.local/luma-publication-${device}.png`,
    });
  }
  await publication
    .getByRole("checkbox", {
      name: "I confirm this change to the event's Luma registration link.",
      exact: true,
    })
    .check();
  await publication
    .getByRole("button", { name: "Confirm Luma link change", exact: true })
    .click();
  await expect(publication).toHaveCount(0);
  await expect(
    participation.getByRole("heading", {
      name: "Registration on Luma",
      exact: true,
    }),
  ).toBeVisible();
  expect((await visitor.request.get(url)).status()).toBe(404);
  await manager.setViewportSize({ width: 1440, height: 1000 });
  await manager
    .getByRole("button", { name: "Event page", exact: true })
    .click();
  await Promise.all([
    manager.waitForEvent("dialog").then((dialog) => dialog.accept()),
    manager
      .getByRole("button", { name: "Publish changes", exact: true })
      .click(),
  ]);
  await expect(
    manager.getByText("Published. Guests now see this event and page.", {
      exact: true,
    }),
  ).toBeVisible();
  await manager
    .locator("summary")
    .filter({ hasText: /^Page languages & availability$/ })
    .click();
  await expect(manager.getByText(/Event details published/)).toBeVisible();
  await visitor.goto(url);
  const outbound = visitor.getByRole("link", {
    name: "Continue to Luma",
    exact: true,
  });
  await expect(outbound).toHaveAttribute("href", destination);
  await expect(outbound).toHaveAttribute("rel", "noopener noreferrer");
  await expect(outbound).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(
    visitor.getByRole("button", { name: "Register", exact: true }),
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
      path: `.local/luma-public-${device}.png`,
      fullPage: true,
    });
  }
  // A saved new draft never replaces the published external destination.
  await eventPackagesJourney(manager, visitor, id);
  await manager
    .getByRole("button", { name: "Registration & forms", exact: true })
    .click();
  await link
    .getByRole("textbox", { name: "Luma event URL", exact: true })
    .fill("https://lu.ma/rotapress-synthetic-private-draft");
  await link
    .getByRole("button", { name: "Save Luma link draft", exact: true })
    .click();
  await expect(
    link.getByRole("button", { name: "Save Luma link draft", exact: true }),
  ).toBeDisabled();
  await visitor.reload();
  await expect(outbound).toHaveAttribute("href", destination);
  await expect(
    visitor.getByText("https://lu.ma/rotapress-synthetic-private-draft", {
      exact: true,
    }),
  ).toHaveCount(0);
  // A club-wide disable is immediate but preserves the event's page and link draft.
  await lumaConnectionJourney(owner, manager, visitor, browser, signIn);
  await owner
    .getByRole("link", { name: "All integrations", exact: true })
    .click();
  await expect(
    availability.getByText("No API key saved", { exact: true }),
  ).toBeVisible();
  await availability
    .getByRole("button", { name: "Disable Luma", exact: true })
    .click();
  await review
    .getByRole("checkbox", {
      name: "I confirm this availability change for the club.",
      exact: true,
    })
    .check();
  await review
    .getByRole("button", { name: "Confirm Luma availability", exact: true })
    .click();
  await expect(
    availability.getByText("Disabled", { exact: true }),
  ).toBeVisible();
  await owner.reload();
  await expect(
    availability.getByRole("button", { name: "Enable Luma", exact: true }),
  ).toBeVisible();
  await manager.goto(`/admin/events/${id}?tab=participation`);
  await expect(
    link.getByRole("textbox", { name: "Luma event URL", exact: true }),
  ).not.toBeVisible();
  await link.getByText("Saved Luma link (disabled)", { exact: true }).click();
  await expect(
    link.getByRole("textbox", { name: "Luma event URL", exact: true }),
  ).toHaveValue("https://lu.ma/rotapress-synthetic-private-draft");
  await expect(
    link.getByRole("button", { name: "Save Luma link draft", exact: true }),
  ).toBeDisabled();
  expect((await visitor.request.get(url)).status()).toBe(404);
  await visitor.goto(`${origin}/events/${id}/en/website`);
  await expect(
    visitor.getByRole("heading", {
      name: "Synthetic Luma gathering",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    visitor
      .getByRole("navigation", { name: "Event navigation" })
      .getByRole("link", { name: "Registration", exact: true }),
  ).toHaveCount(0);
  expect(providerRequests).toBe(0);
  for (const current of contexts)
    await current.unroute(/^https:\/\/(luma\.com|lu\.ma)\//);
  await context.close();
  await manager.goto(`/admin/events/${returnEventId}`);
}
