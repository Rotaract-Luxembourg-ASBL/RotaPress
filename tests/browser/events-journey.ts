import { expect, type Page, type Browser } from "@playwright/test";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { eventWebsiteJourney } from "./event-website-journey";
import { eventRegistrationJourney } from "./event-registration-journey";
import { eventTemplateJourney } from "./event-template-journey";
import { eventLumaJourney } from "./event-luma-journey";
import { guestAccessJourney, type SignInGuest } from "./guest-access-journey";

/** Extends B01 with the same real OTP identities, never a fabricated session. */
export async function eventDraftJourney(
  owner: Page,
  manager: Page,
  browser: Browser,
  signIn: SignInGuest,
  identities: { ownerEmail: string; managerEmail: string },
) {
  await owner.goto("/admin/events");
  await owner.getByRole("button", { name: "New event", exact: true }).click();
  const creation = owner.getByRole("dialog", { name: "New event draft" });
  async function createDetailsOnly() {
    await creation.getByRole("checkbox", { name: /^Event page\b/ }).uncheck();
    await creation
      .getByRole("button", { name: "Review event setup", exact: true })
      .click();
    await creation
      .getByRole("checkbox", {
        name: "Enable the listed features and create this private draft.",
        exact: true,
      })
      .check();
    await creation
      .getByRole("button", {
        name: "Confirm features and create draft",
        exact: true,
      })
      .click();
  }
  await creation
    .getByLabel("Event name", { exact: true })
    .fill("Synthetic Event A");
  await creation
    .getByLabel("Description", { exact: true })
    .fill("Private planning description for Event A.");
  await creation
    .getByRole("combobox", { name: "Responsible manager", exact: true })
    .selectOption({ label: identities.managerEmail });
  await creation.getByRole("button", { name: "Next", exact: true }).click();
  await creation
    .getByLabel("Start time", { exact: true })
    .fill("2026-12-01T18:00");
  await creation.getByRole("button", { name: "Next", exact: true }).click();
  await createDetailsOnly();
  await expect(owner).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}$/);
  const eventA = new URL(owner.url()).pathname.split("/").at(-1)!;
  await expect(owner.getByLabel("Event name", { exact: true })).toHaveValue(
    "Synthetic Event A",
  );
  await owner.goto("/admin/events");
  await owner.getByRole("button", { name: "New event", exact: true }).click();
  await creation
    .getByLabel("Event name", { exact: true })
    .fill("Synthetic Event B");
  await creation.getByRole("button", { name: "Next", exact: true }).click();
  await creation
    .getByLabel("Start time", { exact: true })
    .fill("2026-12-02T18:00");
  await creation.getByRole("button", { name: "Next", exact: true }).click();
  await createDetailsOnly();
  await expect(owner).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}$/);
  const eventB = new URL(owner.url()).pathname.split("/").at(-1)!;

  // Remove club-wide administration through the actual reviewed access flow.
  await owner.goto("/admin/members");
  const row = owner
    .getByRole("listitem")
    .filter({ hasText: identities.managerEmail });
  await row.getByRole("button", { name: "Manage access" }).click();
  const access = owner.getByRole("dialog", { name: "Manage access" });
  await access
    .getByRole("combobox", { name: "Club role", exact: true })
    .selectOption("member");
  await access.getByRole("button", { name: "Review changes" }).click();
  await access.getByRole("button", { name: "Confirm access change" }).click();
  await expect(
    owner.getByText("Membership updated.", { exact: false }),
  ).toBeVisible();

  await manager.goto("/admin/events");
  await expect(
    manager.getByText("Synthetic Event A", { exact: true }),
  ).toBeVisible();
  await expect(
    manager.getByText("Synthetic Event B", { exact: true }),
  ).toHaveCount(0);
  expect((await manager.request.get("/api/admin/members")).status()).toBe(403);
  expect((await manager.request.get("/api/admin/cms/content")).status()).toBe(
    403,
  );
  expect(
    (await manager.request.get(`/api/admin/events/${eventB}`)).status(),
  ).toBe(404);
  await manager.getByRole("link", { name: "Open event", exact: true }).click();
  const beforeSectionNavigation = await manager.request
    .get(`/api/admin/events/${eventA}`)
    .then((response) => response.json());
  await manager
    .getByLabel("Venue", { exact: true })
    .fill("Synthetic community room");
  await manager.getByRole("button", { name: "Team", exact: true }).click();
  await manager.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    manager.getByRole("textbox", { name: "Form title", exact: true }),
  ).toHaveCount(0);
  await expect(
    manager.getByRole("textbox", { name: "Luma event URL", exact: true }),
  ).toHaveCount(0);
  await manager
    .getByRole("button", { name: "Event details", exact: true })
    .click();
  await expect(manager.getByLabel("Venue", { exact: true })).toHaveValue(
    "Synthetic community room",
  );
  expect(
    await manager.request
      .get(`/api/admin/events/${eventA}`)
      .then((response) => response.json()),
  ).toEqual(beforeSectionNavigation);
  await manager
    .getByRole("button", { name: "Save event draft", exact: true })
    .click();
  await expect(
    manager.getByText("Event draft saved. It remains private."),
  ).toBeVisible();
  await manager.reload();
  await expect(manager.getByLabel("Venue", { exact: true })).toHaveValue(
    "Synthetic community room",
  );
  await expect(
    manager.getByRole("button", { name: "Change manager", exact: true }),
  ).toHaveCount(0);
  // The same real member session can be an editor on B without manager authority there.
  await owner.goto(`/admin/events/${eventB}?tab=team`);
  await owner
    .getByRole("combobox", { name: "Add event editor", exact: true })
    .selectOption({ label: identities.managerEmail });
  await owner
    .getByRole("button", { name: "Review editor access", exact: true })
    .click();
  const teamReview = owner.getByRole("dialog", {
    name: "Review event editor access",
    exact: true,
  });
  await expect(
    teamReview.getByText(/does not grant team management/),
  ).toBeVisible();
  expect(
    (await manager.request.get(`/api/admin/events/${eventB}`)).status(),
  ).toBe(404);
  await teamReview
    .getByRole("button", { name: "Confirm event editor access", exact: true })
    .click();
  await expect(teamReview).toHaveCount(0);
  await owner
    .getByRole("button", { name: "Event details", exact: true })
    .click();
  await expect(
    owner.getByText(
      "Event team updated. Event details and club permissions are unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
  await owner.setViewportSize({ width: 1440, height: 1000 });
  await owner.getByRole("button", { name: "Team", exact: true }).click();
  await owner
    .getByRole("heading", { name: "Synthetic Event B", exact: true })
    .click();
  await owner.evaluate(() => window.scrollTo(0, 0));
  const teamLayout = await owner
    .getByRole("region", { name: "Event team", exact: true })
    .evaluate((panel) => ({
      panel: panel.getBoundingClientRect().right,
      children: Array.from(panel.children).map(
        (child) => child.getBoundingClientRect().right,
      ),
    }));
  expect(
    Math.max(...teamLayout.children),
    JSON.stringify(teamLayout),
  ).toBeLessThanOrEqual(teamLayout.panel);
  await owner.screenshot({
    path: ".local/event-team-desktop.png",
    fullPage: true,
    mask: [owner.locator(".admin-account")],
  });
  await owner.setViewportSize({ width: 390, height: 844 });
  expect(
    await owner.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await owner.screenshot({
    path: ".local/event-team-phone.png",
    fullPage: true,
    mask: [owner.locator(".admin-account")],
  });
  await owner.setViewportSize({ width: 1440, height: 1000 });
  await manager.goto(`/admin/events/${eventB}`);
  await expect(
    manager.getByRole("button", { name: "Archive event", exact: true }),
  ).toHaveCount(0);
  await expect(
    manager.getByRole("combobox", { name: "Add event editor", exact: true }),
  ).toHaveCount(0);
  await manager
    .getByLabel("Venue", { exact: true })
    .fill("Edited by the assigned event editor");
  await manager
    .getByRole("button", { name: "Save event draft", exact: true })
    .click();
  await expect(
    manager.getByText("Event draft saved. It remains private."),
  ).toBeVisible();
  const edited = (await manager.request
    .get(`/api/admin/events/${eventB}`)
    .then((response) => response.json())) as { version: number };
  expect(
    (
      await manager.request.post(`/api/admin/events/${eventB}/archive`, {
        headers: { origin: smokeOrigin },
        data: { expectedVersion: edited.version },
      })
    ).status(),
  ).toBe(403);
  await owner.reload();
  await owner
    .getByRole("region", { name: "Event team", exact: true })
    .getByRole("button", { name: "Remove editor", exact: true })
    .click();
  await teamReview
    .getByRole("button", { name: "Confirm event editor access", exact: true })
    .click();
  await expect(teamReview).toHaveCount(0);
  expect(
    (await manager.request.get(`/api/admin/events/${eventB}`)).status(),
  ).toBe(404);
  expect(
    (await manager.request.get(`/api/admin/events/${eventA}`)).status(),
  ).toBe(200);
  await owner
    .getByRole("button", { name: "Event details", exact: true })
    .click();
  await expect(owner.getByLabel("Venue", { exact: true })).toHaveValue(
    "Edited by the assigned event editor",
  );
  await manager.goto(`/admin/events/${eventA}`);
  await owner.goto(`/admin/events/${eventA}`);
  for (const email of [identities.ownerEmail, identities.managerEmail]) {
    await owner
      .getByRole("button", { name: "Change manager", exact: true })
      .click();
    const assignment = owner.getByRole("dialog", {
      name: "Change event manager",
      exact: true,
    });
    await assignment
      .getByRole("combobox", { name: "New responsible manager", exact: true })
      .selectOption({ label: email });
    await assignment
      .getByRole("button", { name: "Review manager change", exact: true })
      .click();
    // Review alone never changes authorization.
    expect(
      (await manager.request.get(`/api/admin/events/${eventA}`)).status(),
    ).toBe(email === identities.ownerEmail ? 200 : 404);
    await assignment.screenshot({
      path: ".local/event-manager-confirmation.png",
    });
    await assignment
      .getByRole("button", { name: "Confirm manager change", exact: true })
      .click();
    await expect(assignment).toHaveCount(0);
    await expect(
      owner.getByText(
        "Event manager updated. Existing event details are preserved.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      (await manager.request.get(`/api/admin/events/${eventA}`)).status(),
    ).toBe(email === identities.ownerEmail ? 404 : 200);
  }
  await manager.reload();
  await expect(manager.getByLabel("Venue", { exact: true })).toHaveValue(
    "Synthetic community room",
  );
  await manager.setViewportSize({ width: 1440, height: 1000 });
  await manager.screenshot({
    path: ".local/event-draft-desktop.png",
    fullPage: true,
  });
  await manager.setViewportSize({ width: 390, height: 844 });
  expect(
    await manager.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await manager.screenshot({
    path: ".local/event-draft-phone.png",
    fullPage: true,
  });
  await manager.setViewportSize({ width: 320, height: 844 });
  expect(
    await manager.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const anonymous = await browser.newContext();
  expect(
    (
      await anonymous.request.get(`${smokeOrigin}/api/admin/events/${eventA}`)
    ).status(),
  ).toBe(401);
  expect(
    (await anonymous.request.get(`${smokeOrigin}/events/${eventA}`)).status(),
  ).toBe(404);
  await anonymous.close();
  await eventWebsiteJourney(owner, manager, browser, eventA);
  await eventRegistrationJourney(owner, manager, browser, eventA);
  await guestAccessJourney(manager, browser, eventA, signIn);
  await eventTemplateJourney(owner, manager, browser, eventA);
  await eventLumaJourney(
    owner,
    manager,
    browser,
    eventA,
    identities.managerEmail,
    signIn,
  );

  // Removal is contextual in the header and list; dismissing preserves the event.
  await expect(
    manager.getByRole("button", { name: "Archive event", exact: true }),
  ).toBeHidden();
  await manager.getByLabel("Event actions", { exact: true }).click();
  await manager
    .getByRole("button", { name: "Archive event", exact: true })
    .click();
  const removal = manager.getByRole("dialog", {
    name: "Archive event",
    exact: true,
  });
  await expect(removal.getByText(/cannot currently be restored/)).toBeVisible();
  await removal
    .getByRole("button", { name: "Keep event", exact: true })
    .click();
  expect(
    (
      await manager.request
        .get(`/api/admin/events/${eventA}`)
        .then((response) => response.json())
    ).archived,
  ).toBe(false);
  await manager.goto("/admin/events");
  const eventRow = manager.getByRole("listitem").filter({
    has: manager.getByRole("link", {
      name: "Synthetic Event A",
      exact: true,
    }),
  });
  await eventRow
    .getByLabel("Actions for Synthetic Event A", { exact: true })
    .click();
  await eventRow
    .getByRole("button", { name: "Archive event", exact: true })
    .click();
  await removal.screenshot({ path: ".local/event-removal-review.png" });
  await removal
    .getByRole("button", { name: "Archive event", exact: true })
    .click();
  await expect(removal).toHaveCount(0);
  await expect(eventRow).toHaveCount(0);
  await manager
    .getByRole("group", { name: "Filter events by status", exact: true })
    .getByRole("button", { name: /^Archived/ })
    .click();
  await expect(eventRow.getByText("Archived", { exact: true })).toBeVisible();
  const retained = await manager.request
    .get(`/api/admin/events/${eventA}/forms`)
    .then((response) => response.json());
  expect(retained.forms).toHaveLength(2);
  await eventRow.getByRole("link", { name: "View event", exact: true }).click();
  await expect(manager.getByLabel("Venue", { exact: true })).toBeDisabled();
  await owner.goto("/admin/members");
  return eventA;
}
