import { expect, type Page, type Browser } from "@playwright/test";
import { smokeOrigin as origin } from "../../scripts/smoke_origin.mjs";
import { eventPageParticipationJourney } from "./event-page-participation-journey";

/** Uses the existing real OTP sessions; all names and submissions are synthetic. */
export async function eventRegistrationJourney(
  owner: Page,
  manager: Page,
  browser: Browser,
  eventId: string,
) {
  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  const panel = manager.getByRole("region", {
    name: "Event forms and registration",
    exact: true,
  });
  await manager.goto(`/admin/events/${eventId}?tab=participation`);
  await manager.setViewportSize({ width: 1440, height: 1000 });
  for (const label of ["Forms", "Registration"]) {
    manager.once("dialog", (dialog) => dialog.accept());
    await panel
      .getByRole("button", { name: `Enable ${label}`, exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: `Disable ${label}`, exact: true }),
    ).toBeVisible();
  }
  await panel
    .getByRole("combobox", { name: "Form purpose", exact: true })
    .selectOption("registration");
  await panel
    .getByRole("textbox", { name: "Form title", exact: true })
    .fill("Synthetic event registration");
  await panel
    .getByRole("button", { name: "Create event form draft", exact: true })
    .click();
  await panel
    .getByRole("link", { name: "Synthetic event registration", exact: true })
    .click();
  await expect(
    manager.getByRole("button", { name: "Publish form", exact: true }),
  ).toBeEnabled();
  const formId = new URL(manager.url()).pathname.split("/").at(-1)!;
  expect(
    (await visitor.request.get(`${origin}/api/forms/${formId}`)).status(),
  ).toBe(404);
  // Saving wording remains draft-only and uses the same existing form editor.
  await manager
    .getByRole("textbox", { name: "Introduction", exact: true })
    .fill("Reserve your free place at this synthetic community gathering.");
  await manager
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(
    manager.getByText("Draft saved. Publish when it is ready for visitors."),
  ).toBeVisible();
  await manager
    .getByRole("button", { name: "Publish form", exact: true })
    .click();
  await expect(
    manager.getByText(
      "Form published. Visitors now see your latest saved version.",
      { exact: true },
    ),
  ).toBeVisible();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await manager.setViewportSize({ width, height: 1000 });
    expect(
      await manager.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await manager.screenshot({
      path: `.local/event-form-${device}.png`,
      fullPage: true,
      mask: [manager.locator(".admin-account")],
    });
  }
  await manager
    .getByRole("link", { name: "Back to event", exact: true })
    .click();
  await panel
    .getByRole("combobox", { name: "Registration form", exact: true })
    .selectOption({ label: "Synthetic event registration" });
  await panel
    .getByRole("spinbutton", { name: "Capacity", exact: true })
    .fill("1");
  await panel
    .getByRole("checkbox", { name: "Open registration", exact: true })
    .check();
  manager.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Save registration settings", exact: true })
    .click();
  await expect(
    panel.getByText("0 confirmed of 1 places · Open", { exact: true }),
  ).toBeVisible();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await manager.setViewportSize({ width, height: 1000 });
    expect(
      await manager.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel.screenshot({
      path: `.local/event-registration-admin-${device}.png`,
    });
  }
  const url = `/events/${eventId}/en/registration`;
  await visitor.goto(`${origin}${url}`);
  await expect(
    visitor.getByRole("link", { name: "Sign in to register", exact: true }),
  ).toBeVisible();
  expect(
    (
      await visitor.request.post(
        `${origin}/api/events/${eventId}/registration`,
        { headers: { origin }, data: {} },
      )
    ).status(),
  ).toBe(401);
  const pageUrl = await eventPageParticipationJourney(
    manager,
    visitor,
    eventId,
  );
  await owner.goto(pageUrl);
  const placedRegistration = owner.getByRole("region", {
    name: "Event registration",
    exact: true,
  });
  await expect(
    placedRegistration.getByRole("textbox", {
      name: "Your name",
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    owner
      .getByRole("navigation", { name: "Event navigation" })
      .getByRole("link", { name: "Registration", exact: true }),
  ).toBeVisible();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await owner.setViewportSize({ width, height: 844 });
    expect(
      await owner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await owner.screenshot({
      path: `.local/event-registration-public-${device}.png`,
      fullPage: true,
    });
  }
  await placedRegistration
    .getByRole("textbox", { name: "Your name", exact: false })
    .fill("Synthetic browser registrant");
  await placedRegistration
    .getByRole("button", { name: "Register", exact: true })
    .click();
  await expect(
    owner.getByText("Your place is confirmed.", { exact: true }),
  ).toBeVisible();
  await visitor.reload();
  await expect(
    visitor.getByText("This event is full.", { exact: true }),
  ).toBeVisible();
  await owner.goto("/membership?tab=bookings");
  await expect(
    owner.getByRole("heading", { name: "My bookings", exact: true }),
  ).toBeVisible();
  await expect(
    owner.getByRole("button", { name: "Cancel registration", exact: true }),
  ).toBeVisible();
  owner.once("dialog", (dialog) => dialog.accept());
  await owner
    .getByRole("button", { name: "Cancel registration", exact: true })
    .click();
  await expect(owner.getByText("Cancelled", { exact: true })).toBeVisible();
  await visitor.reload();
  await expect(
    visitor.getByRole("link", { name: "Sign in to register", exact: true }),
  ).toBeVisible();
  await manager.reload();
  await expect(
    panel.getByText("0 confirmed of 1 places · Open", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("link", { name: "Private response", exact: true })
    .click();
  await expect(
    manager.getByText("Synthetic browser registrant", { exact: true }),
  ).toBeVisible();
  await manager.goto(`/admin/events/${eventId}?tab=participation`);
  await anonymous.close();
}
