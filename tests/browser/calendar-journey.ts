import { randomUUID } from "node:crypto";
import { expect, type Page, type Browser } from "@playwright/test";
import type {
  CalendarWorkspace,
  CalendarFeed,
} from "../../src/features/calendar/calendar_schemas";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import { runLocalTestJobs } from "./local-jobs";
import { calendarEmailJourney } from "./email-scope-journey";

/** Extends B02 with real owner/verified guest sessions and disposable club data. */
export async function calendarJourney(
  page: Page,
  visitor: Page,
  browser: Browser,
  origin: string,
  homeId: string,
) {
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const until = new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10);
  const query = `/api/calendar?from=${date}&to=${until}&timezone=UTC`;
  const title = "Community workshop";
  const errors: string[] = [];
  const collect = (error: Error) => errors.push(error.message);
  page.on("pageerror", collect);
  visitor.on("pageerror", collect);
  const post = async (path: string, data: unknown) => {
    const result = await page.request.post(path, { headers: { origin }, data });
    expect(result.ok(), `Calendar mutation ${path}: ${result.status()}`).toBe(
      true,
    );
    return result;
  };
  const workspace = async () =>
    (
      await page.request.get("/api/admin/calendar")
    ).json() as Promise<CalendarWorkspace>;
  expect((await visitor.request.get("/api/admin/calendar")).status()).toBe(401);
  expect(
    (
      await page.request.post("/api/admin/calendar", {
        headers: { origin: "https://untrusted.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await page.goto("/admin/calendar");
  await page.getByRole("button", { name: "New calendar", exact: true }).click();
  const create = page.getByRole("dialog", {
    name: "Create a calendar",
    exact: true,
  });
  await create
    .getByLabel("Calendar name", { exact: true })
    .fill("Community life");
  await create
    .getByLabel("Description", { exact: true })
    .fill("Activities for everyone in the community.");
  await create.getByRole("button", { name: "Continue", exact: true }).click();
  const zone = create.getByRole("combobox", {
    name: "Default time zone",
    exact: true,
  });
  await zone.click();
  expect(await create.getByRole("option").count()).toBeGreaterThan(300);
  await zone.fill("Australia/Syd");
  await create
    .getByRole("option", { name: "Australia / Sydney", exact: true })
    .click();
  await expect(zone).toHaveValue("Australia / Sydney");
  await create.screenshot({
    path: ".local/calendar-create-audience-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  expect(
    await create.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await create.screenshot({
    path: ".local/calendar-create-audience-phone.png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await create.getByRole("button", { name: "Continue", exact: true }).click();
  await create
    .getByRole("combobox", { name: "Events to include", exact: true })
    .selectOption("all");
  await create
    .getByRole("button", { name: "Create calendar", exact: true })
    .click();
  await expect(create).toHaveCount(0);
  expect(
    ((await visitor.request.get(query).then((r) => r.json())) as CalendarFeed)
      .calendars,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Publish calendar", exact: true })
    .click();
  await expect(
    page.getByText("Published calendar", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit calendar", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit calendar", exact: true });
  await edit
    .getByRole("button", { name: "Audience & time", exact: false })
    .click();
  const editingZone = edit.getByRole("combobox", {
    name: "Default time zone",
    exact: true,
  });
  await expect(editingZone).toHaveValue("Australia / Sydney");
  await editingZone.fill("NoSuchCity");
  await expect(edit.getByRole("status")).toContainText("No matching zone");
  await editingZone.press("Escape");
  await expect(edit).toBeVisible();
  await expect(editingZone).toHaveValue("Australia / Sydney");
  await editingZone.fill("Beirut");
  await editingZone.press("Enter");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit).toHaveCount(0);
  const edited = (await workspace()).calendars[0];
  expect(edited.draft.timezone).toBe("Asia/Beirut");
  expect(edited.published?.timezone).toBe("Australia/Sydney");
  await page.reload();
  await expect(
    page.getByText("Saved changes · not published yet", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit calendar", exact: true })
    .click();
  await edit
    .getByRole("button", { name: "Audience & time", exact: false })
    .click();
  await expect(editingZone).toHaveValue("Asia / Beirut");
  await editingZone.fill("Tokyo");
  await editingZone.press("Enter");
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(edit).toHaveCount(0);
  expect((await workspace()).calendars[0].draft.timezone).toBe("Asia/Beirut");
  await page
    .getByRole("button", { name: "Publish calendar", exact: true })
    .click();
  await expect(
    page.getByText("Saved changes · not published yet", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  const schedule = page.getByRole("dialog", {
    name: "Add an activity",
    exact: true,
  });
  await schedule.getByLabel("Activity title", { exact: true }).fill(title);
  await schedule.getByLabel("Location", { exact: true }).fill("Community room");
  await schedule.getByRole("button", { name: "Continue", exact: true }).click();
  await schedule.getByLabel("First date", { exact: true }).fill(date);
  await schedule.getByLabel("Start time", { exact: true }).fill("18:00");
  await schedule
    .getByRole("combobox", { name: "Repeat", exact: true })
    .selectOption("daily");
  await schedule.getByRole("spinbutton", { name: /Repeat every/ }).fill("7");
  await schedule.getByLabel("Repeat until (optional)").fill(until);
  await schedule.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    schedule.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await schedule
    .getByRole("button", { name: "Save activity draft", exact: true })
    .click();
  await expect(schedule).toHaveCount(0);
  expect(
    (
      (await visitor.request.get(query).then((r) => r.json())) as CalendarFeed
    ).occurrences.some((o) => o.title === title),
  ).toBe(false);
  await page
    .getByLabel("Activity actions for " + title, { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Publish activity", exact: true })
    .click();
  await expect(
    page.getByText("Published", { exact: true }).first(),
  ).toBeVisible();
  let state = await workspace();
  const publicCalendar = state.calendars[0];
  const hidden = (await post("/api/admin/calendar", {
    operation: "save",
    expectedVersion: 0,
    definition: {
      ...publicCalendar.draft,
      name: "Member planning",
      audience: "members",
      color: "#6746a0",
      eventSource: "none",
    },
  }).then((r) => r.json())) as { id: string };
  await post("/api/admin/calendar", {
    operation: "publish",
    expectedVersion: 1,
    id: hidden.id,
  });
  const privateSchedule = (await post("/api/admin/calendar/schedules", {
    operation: "save",
    expectedVersion: 0,
    calendarId: hidden.id,
    definition: {
      ...state.schedules[0].draft,
      title: "Private member discussion",
    },
  }).then((r) => r.json())) as { id: string };
  await post("/api/admin/calendar/schedules", {
    operation: "publish",
    expectedVersion: 1,
    calendarId: hidden.id,
    id: privateSchedule.id,
  });
  const publicFeed = (await visitor.request
    .get(query)
    .then((r) => r.json())) as CalendarFeed;
  expect(publicFeed.occurrences.some((o) => o.title === title)).toBe(true);
  expect(JSON.stringify(publicFeed)).not.toContain("Member planning");
  expect(JSON.stringify(publicFeed)).not.toContain("Private member discussion");
  expect(
    ((await page.request.get(query).then((r) => r.json())) as CalendarFeed)
      .calendars,
  ).toHaveLength(2);
  const exportFeed = await page.request.get("/calendar/feed");
  expect(exportFeed.status()).toBe(200);
  expect(exportFeed.headers()["content-type"]).toContain("text/calendar");
  expect(await exportFeed.text()).not.toContain("Private member discussion");
  expect(await exportFeed.text()).toContain(title);

  await page
    .getByRole("button", { name: "Import or connect", exact: true })
    .click();
  const importing = page.getByRole("dialog", {
    name: "Import or connect a calendar",
    exact: true,
  });
  await importing
    .getByLabel("Import name", { exact: true })
    .fill("Local programme");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:browser-import",
    `DTSTART:${date.replaceAll("-", "")}T120000Z`,
    `DTEND:${date.replaceAll("-", "")}T130000Z`,
    "SUMMARY:Imported community lunch",
    "ATTENDEE:mailto:synthetic-private@example.test",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  await importing
    .getByLabel("Calendar file (.ics, up to 512 KB)", { exact: true })
    .setInputFiles({
      name: "synthetic.ics",
      mimeType: "text/calendar",
      buffer: Buffer.from(ics),
    });
  await importing
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await expect(
    importing.getByText("Imported community lunch", { exact: true }),
  ).toBeVisible();
  await importing
    .getByRole("button", { name: "Save import draft", exact: true })
    .click();
  await expect(importing).toHaveCount(0);
  expect(await visitor.request.get(query).then((r) => r.text())).not.toContain(
    "Imported community lunch",
  );
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Review Local programme",
    exact: true,
  });
  await review.getByRole("checkbox").check();
  await review
    .getByRole("button", { name: "Publish imported activities", exact: true })
    .click();
  await expect(review).toHaveCount(0);
  const imported = await visitor.request.get(query).then((r) => r.text());
  expect(imported).toContain("Imported community lunch");
  expect(imported).not.toContain("synthetic-private");

  await calendarEmailJourney(page, publicCalendar.id, hidden.id);
  await page.getByRole("button", { name: "Page design", exact: true }).click();
  const design = page.getByRole("region", {
    name: "Calendar page design",
    exact: true,
  });
  await design
    .getByLabel("Page title", { exact: true })
    .fill("Our community, together");
  await design
    .getByRole("combobox", { name: "Starting view", exact: true })
    .selectOption("month");
  await design
    .getByRole("button", { name: "Save page draft", exact: true })
    .click();
  await expect(
    page.getByText("Page draft saved. The public page is unchanged.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await visitor.request.get("/calendar").then((r) => r.text()),
  ).not.toContain("Our community, together");
  await design
    .getByRole("button", { name: "Publish page design", exact: true })
    .click();
  await expect(
    page.getByText("Calendar page published.", { exact: true }),
  ).toBeVisible();
  await visitor.goto("/calendar");
  await expect(
    visitor.getByRole("heading", {
      name: "Our community, together",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    visitor.getByLabel("Community life", { exact: true }),
  ).toBeChecked();
  await expect(
    visitor.getByLabel("Member planning", { exact: true }),
  ).toHaveCount(0);
  if (date.slice(0, 7) !== new Date().toISOString().slice(0, 7))
    await visitor
      .getByRole("button", { name: "Next period", exact: true })
      .click();
  await visitor.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(
    visitor.getByRole("button", { name: new RegExp(title) }).first(),
  ).toBeVisible();
  for (const [name, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await visitor.setViewportSize({ width, height: 1000 });
    for (const screen of [page, visitor])
      expect(
        await screen.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    await page.screenshot({
      path: `.local/calendar-admin-${name}.png`,
      fullPage: true,
      mask: [page.locator(".admin-account")],
    });
    await visitor.screenshot({
      path: `.local/calendar-public-${name}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await visitor.setViewportSize({ width: 1440, height: 1000 });
  await calendarGuest(browser, origin, async () => {
    await post("/api/admin/calendar", {
      operation: "save",
      id: publicCalendar.id,
      expectedVersion: publicCalendar.version,
      definition: {
        ...publicCalendar.draft,
        description: "Updated community programme.",
      },
    });
    await post("/api/admin/calendar", {
      operation: "publish",
      id: publicCalendar.id,
      expectedVersion: publicCalendar.version + 1,
    });
    const jobs = await runLocalTestJobs(origin);
    expect(
      jobs.find((r) => r.event === "calendar_notifications_processed")?.sent,
    ).toBe(1);
  });

  // Embed the same calendars in the actual CMS renderer; private selection must not leak.
  const detail = (await page.request
    .get(`/api/admin/cms/content/${homeId}?locale=en`)
    .then((r) => r.json())) as CmsDetail;
  const draft = await post(`/api/admin/cms/content/${homeId}/save`, {
    locale: "en",
    title: detail.draft.title,
    slug: detail.draft.slug,
    description: detail.draft.description,
    socialImageId: detail.draft.socialImageId,
    expectedRevisionId: detail.draft.id,
    data: {
      ...detail.draft.data,
      content: [
        ...detail.draft.data.content,
        {
          type: "Calendar",
          props: {
            id: "calendar-browser",
            version: 1,
            title: "Community dates",
            calendarIds: [publicCalendar.id, hidden.id],
            view: "agenda",
            timezone: "UTC",
          },
        },
      ],
    },
  });
  expect(draft.ok()).toBe(true);
  const saved = (await page.request
    .get(`/api/admin/cms/content/${homeId}?locale=en`)
    .then((r) => r.json())) as CmsDetail;
  await post(`/api/admin/cms/content/${homeId}/publish`, {
    locale: "en",
    expectedRevisionId: saved.draft.id,
  });
  await visitor.goto(`/pages/en/${detail.draft.slug}`);
  await expect(
    visitor.getByRole("heading", { name: "Community dates", exact: true }),
  ).toBeVisible();
  if (date.slice(0, 7) !== new Date().toISOString().slice(0, 7))
    await visitor
      .getByRole("button", { name: "Next period", exact: true })
      .click();
  await expect(
    visitor.getByRole("button", { name: new RegExp(title) }).first(),
  ).toBeVisible();
  await expect(
    visitor.getByText("Private member discussion", { exact: true }),
  ).toHaveCount(0);
  state = await workspace();
  expect(state.schedules).toHaveLength(2);
  expect(errors).toEqual([]);
  page.off("pageerror", collect);
  visitor.off("pageerror", collect);
}

async function calendarGuest(
  browser: Browser,
  origin: string,
  afterSubscribe: () => Promise<void>,
) {
  const context = await browser.newContext();
  const guest = await context.newPage();
  const email = `calendar-guest-${randomUUID()}@example.test`;
  await guest.goto("/calendar?tab=subscriptions");
  await guest
    .getByRole("link", { name: "Sign in to subscribe", exact: true })
    .click();
  await guest.getByLabel("Email address", { exact: true }).fill(email);
  await guest
    .getByRole("button", { name: "Send verification code", exact: true })
    .click();
  let code = "";
  await expect
    .poll(async () => {
      const mailbox = (await fetch(
        "http://127.0.0.1:18025/api/v1/messages",
      ).then((r) => r.json())) as {
        messages: { ID: string; To: { Address: string }[] }[];
      };
      const mail = mailbox.messages.find((item) =>
        item.To.some((to) => to.Address === email),
      );
      if (!mail) return false;
      const body = (await fetch(
        `http://127.0.0.1:18025/api/v1/message/${mail.ID}`,
      ).then((r) => r.json())) as { Text: string };
      code = body.Text.match(/\b\d{6}\b/)?.[0] ?? "";
      return Boolean(code);
    })
    .toBe(true);
  await guest.getByLabel("Verification code", { exact: true }).fill(code);
  await guest
    .getByRole("button", { name: "Verify and sign in", exact: true })
    .click();
  await expect(guest).toHaveURL(origin + "/calendar?tab=subscriptions");
  const subscriptions = guest.getByRole("region", {
    name: "Calendar subscriptions",
    exact: true,
  });
  await expect(
    subscriptions.getByRole("heading", { name: "Community life", exact: true }),
  ).toBeVisible();
  await expect(
    subscriptions.getByText("Member planning", { exact: true }),
  ).toHaveCount(0);
  await subscriptions
    .getByRole("combobox", { name: "Reminder", exact: true })
    .selectOption("60");
  await subscriptions
    .getByRole("button", { name: "Subscribe", exact: true })
    .click();
  await expect(
    subscriptions.getByText("Subscribed", { exact: true }),
  ).toBeVisible();
  await guest.reload();
  await expect(
    subscriptions.getByRole("combobox", { name: "Reminder", exact: true }),
  ).toHaveValue("60");
  expect((await guest.request.get("/api/admin/calendar")).status()).toBe(403);
  await afterSubscribe();
  await guest.reload();
  await expect(
    subscriptions.getByText("This calendar has updates.", { exact: true }),
  ).toBeVisible();
  await subscriptions
    .getByRole("button", { name: "Mark as read", exact: true })
    .click();
  await expect(subscriptions.getByText("Read", { exact: true })).toBeVisible();
  const mailbox = (await fetch("http://127.0.0.1:18025/api/v1/messages").then(
    (r) => r.json(),
  )) as {
    messages: { ID: string; Subject: string; To: { Address: string }[] }[];
  };
  const notice = mailbox.messages.find(
    (mail) =>
      mail.Subject === "Your calendar has updates" &&
      mail.To.some((to) => to.Address === email),
  );
  expect(notice).toBeDefined();
  const emailBody = (await fetch(
    `http://127.0.0.1:18025/api/v1/message/${notice!.ID}`,
  ).then((r) => r.json())) as { Text: string; HTML: string };
  expect(emailBody.Text).toContain(origin + "/calendar?tab=subscriptions");
  expect(emailBody.Text).not.toContain("Community workshop");
  expect(emailBody.HTML).toContain("Community life calendar news");
  const link = emailBody.Text.split(/\s+/).find((word) =>
    word.startsWith(origin + "/email/unsubscribe#"),
  );
  expect(Boolean(link)).toBe(true);
  // An anonymous visit (including an email scanner GET) cannot change preferences.
  const unsubscribeContext = await browser.newContext();
  const unsubscribe = await unsubscribeContext.newPage();
  await unsubscribe.goto(link!).catch(() => {
    // Do not include the email capability in test error output.
    throw new Error("The calendar email preference page could not be opened.");
  });
  await expect(
    unsubscribe.getByRole("heading", { name: "Stop calendar emails?" }),
  ).toBeVisible();
  expect(
    (
      await guest.request
        .get("/api/calendar/subscriptions")
        .then((r) => r.json())
    ).items[0].email,
  ).toBe(true);
  await unsubscribe
    .getByRole("button", { name: "Unsubscribe from these emails" })
    .click();
  await expect(
    unsubscribe.getByRole("heading", { name: "Your preference is saved" }),
  ).toBeVisible();
  expect(
    (
      await guest.request
        .get("/api/calendar/subscriptions")
        .then((r) => r.json())
    ).items[0],
  ).toMatchObject({ email: false, active: true });
  await unsubscribeContext.close();
  await guest.reload();
  await subscriptions
    .getByRole("button", { name: "Unsubscribe", exact: true })
    .click();
  await expect(
    subscriptions.getByText("Not subscribed", { exact: true }),
  ).toBeVisible();
  await context.close();
}
