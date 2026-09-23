import { expect, type Page } from "@playwright/test";

/** Uses B02's real owner and public events; publication changes only the directory. */
export async function eventDirectoryJourney(page: Page, visitor: Page) {
  await page.goto("/admin/events");
  await page
    .getByRole("navigation", { name: "Events workspace" })
    .getByRole("link", { name: "Directory design", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Events directory design", exact: true }),
  ).toBeVisible();
  const baseline = await visitor.request
    .get("/events")
    .then((response) => response.text());
  const controls = page.getByRole("region", { name: "Directory controls" });
  const preview = page.getByRole("region", { name: "Directory preview" });
  await controls
    .getByLabel("Page title", { exact: true })
    .fill("A calendar for our community");
  await expect(
    preview.getByRole("heading", { name: "A calendar for our community" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish directory", exact: true }),
  ).toBeDisabled();
  await controls
    .getByRole("button", { name: "Appearance", exact: true })
    .click();
  await controls
    .getByRole("combobox", { name: "Event layout", exact: true })
    .selectOption("list");
  await controls
    .getByRole("combobox", { name: "Introduction background", exact: true })
    .selectOption("dark");
  await controls
    .getByRole("combobox", { name: "Heading alignment", exact: true })
    .selectOption("center");
  await page.getByRole("button", { name: "Save design", exact: true }).click();
  await expect(
    page.getByText(
      "Directory draft saved. Visitors still see the published design.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await visitor.request.get("/events").then((response) => response.text()),
  ).not.toContain("A calendar for our community");
  expect(baseline).not.toContain("A calendar for our community");
  await page.reload();
  await expect(controls.getByLabel("Page title", { exact: true })).toHaveValue(
    "A calendar for our community",
  );
  await page
    .getByRole("button", { name: "Publish directory", exact: true })
    .click();
  await expect(
    page.getByText(
      "Directory published. Your /events page now uses this design.",
      { exact: true },
    ),
  ).toBeVisible();
  await visitor.goto("/events");
  await expect(
    visitor.getByRole("heading", {
      name: "A calendar for our community",
      exact: true,
    }),
  ).toBeVisible();
  await expect(visitor.locator(".event-directory-design")).toHaveAttribute(
    "data-tone",
    "dark",
  );
  await controls
    .getByLabel("Page title", { exact: true })
    .fill("Still private");
  await controls
    .getByRole("button", { name: "Event listings", exact: true })
    .click();
  await controls
    .getByRole("combobox", { name: "Show first", exact: true })
    .selectOption("all");
  await controls
    .getByLabel("Event button label", { exact: true })
    .fill("Find out more");
  await page.getByRole("button", { name: "Save design", exact: true }).click();
  await expect(
    page.getByText(
      "Directory draft saved. Visitors still see the published design.",
      { exact: true },
    ),
  ).toBeVisible();
  await visitor.reload();
  await expect(
    visitor.getByRole("heading", {
      name: "A calendar for our community",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await visitor.request.get("/api/admin/events/directory?locale=en")
    ).status(),
  ).toBe(401);
  for (const [name, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await visitor.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/directory-design-${name}.png`,
      fullPage: true,
      mask: [page.locator(".admin-account")],
    });
    await visitor.screenshot({
      path: `.local/directory-public-${name}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
