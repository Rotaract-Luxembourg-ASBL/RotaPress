import { expect, type Page } from "@playwright/test";
import type { FormDto } from "../../src/features/forms/form_types";
import type { ScopedEmailWorkspace } from "../../src/integrations/email/email_schemas";
import { runLocalTestJobs } from "./local-jobs";

export async function formEmailJourney(
  page: Page,
  visitor: Page,
  origin: string,
) {
  async function post(path: string, data: unknown) {
    const response = await page.request.post(path, {
      headers: { origin },
      data,
    });
    expect(
      response.ok(),
      `Form email setup returned ${response.status()}`,
    ).toBe(true);
    return response;
  }
  const form = (await post("/api/admin/forms", {
    kind: "contact",
    title: "Email template enquiry",
  }).then((r) => r.json())) as FormDto;
  const other = (await post("/api/admin/forms", {
    kind: "contact",
    title: "Other email enquiry",
  }).then((r) => r.json())) as FormDto;
  const endpoint = `/api/admin/email-templates?kind=form&id=${form.id}`;
  const workspace = async () =>
    (await page.request
      .get(endpoint)
      .then((r) => r.json())) as ScopedEmailWorkspace;
  expect((await visitor.request.get(endpoint)).status()).toBe(401);
  await page.goto(`/admin/forms/${form.id}`);
  await page.getByRole("tab", { name: "Emails", exact: true }).click();
  const panel = page.getByRole("region", {
    name: "Email templates for Email template enquiry",
    exact: true,
  });
  await expect(
    panel.getByText("Sending: shared template", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Customize for this form", exact: true })
    .click();
  await panel
    .getByLabel("Subject", { exact: true })
    .fill("Response from this enquiry");
  await panel
    .getByLabel("Heading", { exact: true })
    .fill("A message for your community team");
  await panel.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    panel.getByText("Email draft saved for this form.", { exact: true }),
  ).toBeVisible();
  expect((await workspace()).templates[0].published).toBeNull();
  await panel
    .getByRole("button", { name: "Publish template", exact: true })
    .click();
  await expect(
    panel.getByText("Sending: custom template", { exact: true }),
  ).toBeVisible();
  const otherSettings = (await page.request
    .get(`/api/admin/email-templates?kind=form&id=${other.id}`)
    .then((r) => r.json())) as ScopedEmailWorkspace;
  expect(otherSettings.templates[0].published).toBeNull();
  await panel
    .getByRole("button", { name: "Use shared template", exact: true })
    .click();
  await expect(
    panel.getByText("Sending: shared template", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByLabel("Subject", { exact: true })).toHaveValue(
    "Response from this enquiry",
  );
  await panel
    .getByRole("button", { name: "Publish template", exact: true })
    .click();
  await expect(
    panel.getByText("Sending: custom template", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Emails", exact: true }).click();
  await expect(panel.getByLabel("Subject", { exact: true })).toHaveValue(
    "Response from this enquiry",
  );
  const me = (await page.request.get("/api/me").then((r) => r.json())) as {
    actor: { email: string };
  };
  await post(`/api/admin/forms/${form.id}/settings`, {
    recipients: [me.actor.email],
    retentionDays: null,
  });
  await post(`/api/admin/forms/${form.id}/publish`, {
    expectedRevision: form.draftRevision,
  });
  await visitor.goto(`/forms/${form.id}`);
  await visitor
    .getByLabel("Your name", { exact: false })
    .fill("Synthetic visitor");
  await visitor
    .getByLabel("Your email", { exact: false })
    .fill("synthetic-visitor@example.test");
  await visitor
    .getByLabel("Your message", { exact: false })
    .fill("Synthetic private response content");
  await visitor
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    visitor.getByText("Your message has been received.", { exact: true }),
  ).toBeVisible();
  await runLocalTestJobs(origin);
  const mailbox = (await fetch("http://127.0.0.1:18025/api/v1/messages").then(
    (r) => r.json(),
  )) as {
    messages: { ID: string; Subject: string; To: { Address: string }[] }[];
  };
  const message = mailbox.messages.find(
    (m) =>
      m.Subject === "Response from this enquiry" &&
      m.To.some((r) => r.Address === me.actor.email),
  );
  expect(Boolean(message)).toBe(true);
  const body = (await fetch(
    `http://127.0.0.1:18025/api/v1/message/${message!.ID}`,
  ).then((r) => r.json())) as { Text: string; HTML: string };
  expect(body.HTML).toContain("A message for your community team");
  expect(body.Text).not.toContain("Synthetic private response content");
}

export async function calendarEmailJourney(
  page: Page,
  calendarId: string,
  otherId: string,
) {
  await page.getByRole("button", { name: "Emails", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Calendar to customize", exact: true })
    .selectOption(calendarId);
  const panel = page.getByRole("region", {
    name: "Email templates for Community life",
    exact: true,
  });
  await panel
    .getByRole("button", { name: "Customize for this calendar", exact: true })
    .click();
  await expect(panel.getByLabel("Heading", { exact: true })).toHaveValue(
    "Community calendar news",
  );
  await panel
    .getByLabel("Heading", { exact: true })
    .fill("Community life calendar news");
  await panel.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    panel.getByText("Email draft saved for this calendar.", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Publish template", exact: true })
    .click();
  await expect(
    panel.getByText("Sending: custom template", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Email to customize", exact: true })
    .selectOption("calendar_reminder");
  await expect(
    panel.getByText("Sending: shared template", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Customize for this calendar", exact: true })
    .click();
  await panel
    .getByLabel("Heading", { exact: true })
    .fill("A Community life activity is coming up");
  await panel.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    panel.getByText("Email draft saved for this calendar.", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Publish template", exact: true })
    .click();
  await expect(
    panel.getByText("Sending: custom template", { exact: true }),
  ).toBeVisible();
  const other = (await page.request
    .get(`/api/admin/email-templates?kind=calendar&id=${otherId}`)
    .then((r) => r.json())) as ScopedEmailWorkspace;
  expect(other.templates.every((t) => t.published === null)).toBe(true);
  for (const [width, label] of [
    [1440, "desktop"],
    [390, "phone"],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await panel.locator(".email-preview").scrollIntoViewIfNeeded();
    await expect(
      panel
        .frameLocator('iframe[title="Email design preview"]')
        .getByRole("heading", {
          name: "A Community life activity is coming up",
          exact: true,
        }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/calendar-email-${label}.png`,
      fullPage: true,
      mask: [page.locator(".admin-account")],
    });
    if (label === "phone")
      await panel
        .locator(".email-preview")
        .screenshot({ path: ".local/calendar-email-preview-phone.png" });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
