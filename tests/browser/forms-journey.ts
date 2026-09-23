import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { expect, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";
import type {
  FormDto,
  SubmissionDto,
  SubmissionReceipt,
  SubmissionList,
} from "../../src/features/forms/form_types";
import { formSubmitSchema } from "../../src/features/forms/form_schemas";
import { runLocalTestJobs } from "./local-jobs";
import { formDeletionJourney } from "./form-deletion-journey";
import { inboxJourney } from "./inbox-journey";
import { formTemplateJourney } from "./form-template-journey";
import {
  configureFormWebhook,
  reviewFormWebhook,
} from "./form-webhook-journey";

type MailSummary = { ID: string; To: Array<{ Address: string }> };
const mailboxUrl = "http://127.0.0.1:18025";

async function testDatabaseUrl() {
  const environment = parseEnv(await readFile(".local/test.env", "utf8"));
  if (!environment.DATABASE_URL) {
    throw new Error("Run local test setup before the form browser check.");
  }
  const target = new URL(environment.DATABASE_URL);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "55432" ||
    target.pathname !== "/rotapress_test" ||
    target.username !== "rotapress_app"
  ) {
    throw new Error(
      "Form browser checks require the dedicated test database and restricted runtime role.",
    );
  }
  return environment.DATABASE_URL;
}

async function mailText(recipient: string) {
  let text = "";
  await expect
    .poll(
      async () => {
        const mailbox = (await fetch(`${mailboxUrl}/api/v1/messages`).then(
          (response) => response.json(),
        )) as { messages: MailSummary[] };
        const message = mailbox.messages.find((item) =>
          item.To.some((target) => target.Address === recipient),
        );
        if (!message) return false;
        const detail = (await fetch(
          `${mailboxUrl}/api/v1/message/${message.ID}`,
        ).then((response) => response.json())) as { Text: string };
        text = detail.Text;
        return Boolean(text);
      },
      { message: "The synthetic recipient receives a real local SMTP message" },
    )
    .toBe(true);
  return text;
}

async function runTestNotifications(origin: string) {
  const result = (await runLocalTestJobs(origin)).find(
    (r) => r.event === "form_notifications_processed",
  );
  expect(result?.sent).toBe(1);
}

async function submissionAbuseBoundary(
  publicPage: Page,
  formId: string,
  origin: string,
  input: ReturnType<typeof formSubmitSchema.parse>,
) {
  const endpoint = `/api/forms/${formId}/submit`;
  const invalidAnswer = await publicPage.request.post(endpoint, {
    headers: { origin },
    data: {
      ...input,
      requestId: randomUUID(),
      answers: { ...input.answers, email: "not-an-email" },
    },
  });
  expect(invalidAnswer.status()).toBe(422);
  // Legal field lengths can exceed the old 32 KiB transport boundary in UTF-8.
  const multilingual = {
    ...input,
    requestId: randomUUID(),
    answers: {
      ...input.answers,
      name: "界".repeat(1000),
      message: "界".repeat(10000),
    },
  };
  expect(Buffer.byteLength(JSON.stringify(multilingual))).toBeGreaterThan(
    32 * 1024,
  );
  const accepted = await publicPage.request.post(endpoint, {
    headers: { origin },
    data: multilingual,
  });
  expect(accepted.status()).toBe(201);
  expect(await accepted.json()).toMatchObject({ duplicate: false });
  const oversized = await publicPage.request.post(endpoint, {
    headers: { origin },
    data: {
      ...input,
      answers: { ...input.answers, message: "x".repeat(65 * 1024) },
    },
  });
  expect(oversized.status()).toBe(413);
  const foreign = await publicPage.request.post(endpoint, {
    headers: { origin: "https://untrusted.example" },
    data: input,
  });
  expect(foreign.status()).toBe(403);

  const database = new Pool({ connectionString: await testDatabaseUrl() });
  const key = `app:form-submit-global:${createHash("sha256").update("local").digest("hex")}`;
  try {
    await database.query(
      "INSERT INTO club.rate_limit (id,key,count,last_request) VALUES ($1,$1,120,$2) ON CONFLICT (key) DO UPDATE SET count=120,last_request=EXCLUDED.last_request",
      [key, Date.now()],
    );
    const limited = await publicPage.request.post(endpoint, {
      headers: {
        origin,
        "x-forwarded-for": "198.51.100.77",
        "x-real-ip": "203.0.113.24",
        forwarded: "for=192.0.2.33",
      },
      data: input,
    });
    expect(limited.status()).toBe(429);
  } finally {
    // Remove only the one known application bucket changed by this check.
    try {
      await database.query("DELETE FROM club.rate_limit WHERE key=$1", [key]);
    } finally {
      await database.end();
    }
  }
}

async function createForm(
  page: Page,
  kind: "contact" | "membership",
  title: string,
) {
  await page.goto("/admin/forms");
  await expect(page).toHaveURL(/\/admin\/forms$/);
  await page.getByRole("button", { name: "New form", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create a form", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Form templates" })
    .getByRole("button", {
      name: kind === "contact" ? /^Contact / : /^Membership application /,
    })
    .click();
  await page.getByRole("button", { name: /^Continue with/ }).click();
  await page.getByLabel("Form title", { exact: true }).fill(title);
  const created = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/admin/forms" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const form = (await response.json()) as FormDto;
  await expect(page).toHaveURL(new RegExp(`/admin/forms/${form.id}$`));
  await expect(
    page.getByRole("textbox", { name: "Introduction", exact: true }),
  ).toBeVisible();
  return form;
}

async function publishForm(page: Page) {
  const published = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/publish") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publish form", exact: true }).click();
  const response = await published;
  expect(response.status()).toBe(200);
  const form = (await response.json()) as FormDto;
  await expect(
    page.getByText(
      "Form published. Visitors now see your latest saved version.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  return form;
}

async function membershipJourney(page: Page, browser: Browser, origin: string) {
  const form = await createForm(
    page,
    "membership",
    "Synthetic membership application",
  );
  await publishForm(page);
  const context = await browser.newContext();
  try {
    const applicant = await context.newPage();
    const applicantEmail = `form-applicant-${randomUUID()}@example.test`;
    await applicant.goto("/sign-in?next=/membership");
    await expect(applicant.getByLabel("Your name")).toHaveCount(0);
    await applicant.getByLabel("Email address").fill(applicantEmail);
    await applicant
      .getByRole("button", { name: "Send verification code" })
      .click();
    await expect(applicant.getByLabel("Verification code")).toBeVisible();
    const code = (await mailText(applicantEmail)).match(/\b\d{6}\b/)?.[0];
    if (!code) throw new Error("The local verification message has no code.");
    await applicant.getByLabel("Verification code").fill(code);
    await applicant.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(applicant).toHaveURL(`${origin}/membership`);
    await expect(
      applicant.getByRole("heading", { name: form.draft.title, exact: true }),
    ).toBeVisible();
    await expect(
      applicant.getByRole("button", {
        name: "Apply for membership",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      (
        await applicant.request.post("/api/membership", {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(409);
    await applicant
      .getByLabel("Your name", { exact: false })
      .fill("Synthetic Form Applicant");
    await applicant
      .getByLabel("Why would you like to join?", { exact: false })
      .fill("To volunteer in this synthetic local acceptance journey.");
    const accepted = applicant.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/forms/${form.id}/submit`,
    );
    await applicant
      .getByRole("button", { name: "Submit application", exact: true })
      .click();
    expect((await accepted).status()).toBe(201);
    await expect(
      applicant.getByRole("heading", {
        name: "Your application is with the club.",
        exact: true,
      }),
    ).toBeVisible();
    const me = (await applicant.request
      .get("/api/me")
      .then((response) => response.json())) as {
      membership: { status: string; role: string };
      capabilities: string[];
    };
    expect(me.membership).toMatchObject({ status: "pending", role: "member" });
    expect(me.capabilities).toEqual([]);
    expect(
      (
        await applicant.request.get(`/api/admin/forms/${form.id}/submissions`)
      ).status(),
    ).toBe(403);
  } finally {
    await context.close();
  }
}

export async function formsJourney({
  page,
  publicPage,
  browser,
  cmsPageId,
  origin,
}: {
  page: Page;
  publicPage: Page;
  browser: Browser;
  cmsPageId: string;
  origin: string;
}) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const form = await createForm(page, "contact", "Synthetic contact form");
  expect((await publicPage.request.get(`/api/forms/${form.id}`)).status()).toBe(
    404,
  );
  await page
    .getByRole("textbox", { name: "Introduction", exact: true })
    .fill("Tell our synthetic club how you would like to take part.");
  await page.getByText("Layout and confirmation", { exact: true }).click();
  await page
    .getByRole("combobox", { name: /^Field layout/ })
    .selectOption("two-column");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Publish when it is ready for visitors.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const recipient = `form-reviewer-${randomUUID()}@example.test`;
  await page
    .getByLabel("Notification recipients", { exact: false })
    .fill(recipient);
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByText("Notification and retention settings saved.", {
      exact: true,
    }),
  ).toBeVisible();
  await configureFormWebhook(page, form.id);
  await publishForm(page);
  await page.getByRole("tab", { name: "Build", exact: true }).click();
  await page.screenshot({
    path: ".local/forms-builder-desktop.png",
    fullPage: true,
    mask: [page.locator(".admin-account")],
  });

  await page.goto(`/admin/website/${cmsPageId}?locale=en`);
  await page.locator(".editor-canvas .cms-hero h1").click();
  await page
    .getByRole("button", { name: "Add block after Hero", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Form block", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Reusable form", exact: true })
    .selectOption(form.id);
  await expect(
    page
      .locator(".editor-canvas")
      .getByRole("heading", { name: form.draft.title, exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".editor-canvas")
      .getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByText("Published. The website now shows this saved revision.", {
      exact: true,
    }),
  ).toBeVisible();

  await publicPage.goto(`/forms/${form.id}`);
  await expect(
    publicPage.getByRole("heading", { name: form.draft.title, exact: true }),
  ).toBeVisible();
  await publicPage.setViewportSize({ width: 1440, height: 1000 });
  const fields = publicPage.locator('.forms-fields[data-layout="two-column"]');
  await expect(fields).toBeVisible();
  const positions = () =>
    fields.evaluate((element) =>
      Array.from(element.children)
        .slice(0, 2)
        .map((field) => ({
          left: field.getBoundingClientRect().left,
          top: field.getBoundingClientRect().top,
        })),
    );
  const desktopFields = await positions();
  expect(desktopFields[0].top).toBe(desktopFields[1].top);
  expect(desktopFields[1].left).toBeGreaterThan(desktopFields[0].left);
  await publicPage.screenshot({
    path: ".local/forms-public-desktop.png",
    fullPage: true,
  });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  const phoneFields = await positions();
  expect(phoneFields[0].left).toBe(phoneFields[1].left);
  expect(phoneFields[1].top).toBeGreaterThan(phoneFields[0].top);
  expect(
    await publicPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await publicPage.screenshot({
    path: ".local/forms-public-mobile.png",
    fullPage: true,
  });
  await publicPage.goto("/pages/en/home");
  const renderedForm = publicPage.locator(".forms-public");
  await renderedForm.getByLabel("Your name", { exact: false }).fill("=1+1");
  await renderedForm
    .getByLabel("Your email", { exact: false })
    .fill("synthetic-contact@example.test");
  const message = "A private synthetic message for the local form journey.";
  await renderedForm.getByLabel("Your message", { exact: false }).fill(message);
  let committedReceipt: SubmissionReceipt | undefined;
  let originalInput: ReturnType<typeof formSubmitSchema.parse> | undefined;
  await publicPage.route(
    `**/api/forms/${form.id}/submit`,
    async (route) => {
      const committed = await route.fetch();
      expect(committed.status()).toBe(201);
      committedReceipt = (await committed.json()) as SubmissionReceipt;
      originalInput = formSubmitSchema.parse(route.request().postDataJSON());
      // The database transaction completed, but its response never reaches the UI.
      await route.abort("failed");
    },
    { times: 1 },
  );
  await renderedForm
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    renderedForm.getByRole("button", { name: "Retry response", exact: true }),
  ).toBeVisible();
  await expect(
    renderedForm.getByRole("button", { name: "Edit response", exact: true }),
  ).toBeVisible();
  await expect(
    renderedForm.getByLabel("Your message", { exact: false }),
  ).toBeDisabled();
  await expect(
    renderedForm.getByLabel("Your message", { exact: false }),
  ).toHaveValue(message);
  const retried = publicPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/forms/${form.id}/submit`,
  );
  await renderedForm
    .getByRole("button", { name: "Retry response", exact: true })
    .click();
  const response = await retried;
  expect(response.status()).toBe(200);
  const receipt = (await response.json()) as SubmissionReceipt;
  const input = formSubmitSchema.parse(response.request().postDataJSON());
  expect(input).toEqual(originalInput);
  expect(receipt).toMatchObject({ id: committedReceipt?.id, duplicate: true });
  await expect(
    renderedForm.getByText("Your message has been received.", { exact: true }),
  ).toBeVisible();
  const savedResponses = (await page.request
    .get(`/api/admin/forms/${form.id}/submissions`)
    .then((result) => result.json())) as SubmissionList;
  expect(savedResponses.submissions).toHaveLength(1);
  const mismatch = await publicPage.request.post(
    `/api/forms/${form.id}/submit`,
    {
      headers: { origin },
      data: {
        ...input,
        answers: { ...input.answers, message: "A different entry" },
      },
    },
  );
  expect(mismatch.status()).toBe(409);
  expect(
    (
      await publicPage.request.get(`/api/admin/forms/submissions/${receipt.id}`)
    ).status(),
  ).toBe(401);
  expect(
    (
      await publicPage.request.get(
        `/api/admin/forms/${form.id}/submissions/export`,
      )
    ).status(),
  ).toBe(401);

  await runTestNotifications(origin);
  const notification = await mailText(recipient);
  expect(notification).toContain(
    `${origin}/admin/forms/${form.id}/submissions/${receipt.id}`,
  );
  expect(notification).not.toContain(message);
  await reviewFormWebhook(page, form.id, receipt.id);
  await page.goto(`/admin/forms/${form.id}/submissions/${receipt.id}`);
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  const detail = (await page.request
    .get(`/api/admin/forms/submissions/${receipt.id}`)
    .then((result) => result.json())) as SubmissionDto;
  expect(detail.delivery).toHaveLength(1);
  expect(detail.delivery[0]).toMatchObject({ status: "sent", attempts: 1 });
  await page
    .getByRole("combobox", { name: "Review status", exact: true })
    .selectOption("reviewing");
  await page.getByRole("button", { name: "Save status", exact: true }).click();
  await expect(
    page.getByText("Review status saved.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Back to responses", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/admin/inbox\\?formId=${form.id}`));
  // The existing per-form export remains available alongside the central inbox.
  await page.goto(`/admin/forms/${form.id}/submissions`);
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("reviewing");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page.locator(".forms-submission-list li")).toHaveCount(1);
  const exportResponse = page.waitForResponse((result) =>
    new URL(result.url()).pathname.endsWith("/submissions/export"),
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export filtered CSV", exact: true })
    .click();
  const exported = await exportResponse;
  expect(exported.status()).toBe(200);
  expect(new URL(exported.url()).searchParams.get("status")).toBe("reviewing");
  expect(exported.headers()["cache-control"]).toContain("no-store");
  const file = await download;
  expect(await file.failure()).toBeNull();
  const filename = await file.path();
  if (!filename) throw new Error("The local CSV download was not saved.");
  expect(await readFile(filename, "utf8")).toContain('"\'=1+1"');

  await inboxJourney(page, publicPage, form.id, receipt.id, message);
  await formDeletionJourney(page, publicPage, origin, form.id);
  await formTemplateJourney(page, publicPage);
  await membershipJourney(page, browser, origin);
  await submissionAbuseBoundary(publicPage, form.id, origin, input);
}
