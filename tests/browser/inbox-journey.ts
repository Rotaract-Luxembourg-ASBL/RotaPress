import { expect, type Page } from "@playwright/test";
import type { SubmissionDto } from "../../src/features/forms/form_types";

/** Reuse B02's real synthetic form submission; inbox status shares its record. */
export async function inboxJourney(
  page: Page,
  visitor: Page,
  formId: string,
  submissionId: string,
  message: string,
) {
  expect((await visitor.request.get("/api/admin/inbox")).status()).toBe(401);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/inbox");
  await expect(
    page.getByRole("heading", { name: "Response center", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search contacts and messages", exact: true })
    .fill("synthetic-contact@example.test");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Source form", exact: true })
    .selectOption(formId);
  const responses = page.getByRole("region", {
    name: "Responses",
    exact: true,
  });
  const response = responses
    .getByRole("button")
    .filter({ hasText: "synthetic-contact@example.test" });
  await expect(response).toHaveCount(1);
  await expect(response).toContainText("In progress");
  await response.click();
  const detail = page.getByRole("region", {
    name: "Selected response",
    exact: true,
  });
  await expect(detail.getByText(message, { exact: true })).toBeVisible();
  await expect(
    detail.getByText("Contact details supplied by the visitor", {
      exact: true,
    }),
  ).toBeVisible();
  await detail
    .getByRole("combobox", { name: "Review status", exact: true })
    .selectOption("closed");
  await detail
    .getByRole("button", { name: "Save status", exact: true })
    .click();
  await expect(
    detail.getByText("Review status saved.", { exact: true }),
  ).toBeVisible();
  await expect(response).toContainText("Closed");
  const saved = await page.request.get(
    `/api/admin/forms/submissions/${submissionId}`,
  );
  expect(saved.headers()["cache-control"]).toContain("no-store");
  expect((await saved.json()) as SubmissionDto).toMatchObject({
    status: "closed",
  });
  await page
    .locator(".inbox-workspace")
    .screenshot({ path: ".local/contacts-inbox-desktop.png" });
  await page.setViewportSize({ width: 320, height: 900 });
  await response.click();
  await expect(detail.getByRole("heading")).toBeFocused();
  await expect(detail.getByRole("heading")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/contacts-inbox-phone.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("navigation", { name: "Response workspace" })
    .getByRole("button", { name: "People", exact: true })
    .click();
  const contact = page
    .getByRole("article")
    .filter({ hasText: "synthetic-contact@example.test" });
  await expect(contact).toContainText("1 response in this view");
  await contact
    .getByRole("button", { name: "Open response history", exact: true })
    .click();
  await expect(response).toHaveCount(1);
  await response.click();
  await expect(
    detail.getByRole("combobox", { name: "Review status", exact: true }),
  ).toHaveValue("closed");
  await expect(
    detail.getByRole("link", { name: "Full response & delivery", exact: true }),
  ).toHaveAttribute(
    "href",
    `/admin/forms/${formId}/submissions/${submissionId}`,
  );
}
