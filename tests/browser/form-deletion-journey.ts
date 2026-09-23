import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import type { FormDto } from "../../src/features/forms/form_types";
import type { InboxPage } from "../../src/features/forms/inbox_schemas";

/** B02: real responses, form-specific navigation and deliberate archived deletion. */
export async function formDeletionJourney(
  page: Page,
  visitor: Page,
  origin: string,
  otherFormId: string,
) {
  const title = "Synthetic disposable enquiry";
  const created = await page.request.post("/api/admin/forms", {
    headers: { origin },
    data: { kind: "contact", title },
  });
  expect(created.status()).toBe(201);
  const form = (await created.json()) as FormDto;
  const published = await page.request.post(
    `/api/admin/forms/${form.id}/publish`,
    {
      headers: { origin },
      data: { expectedRevision: form.draftRevision },
    },
  );
  expect(published.status()).toBe(200);
  const versionId = ((await published.json()) as FormDto).publishedVersionId;
  const submitted = await visitor.request.post(`/api/forms/${form.id}/submit`, {
    headers: { origin },
    data: {
      versionId,
      requestId: randomUUID(),
      answers: {
        name: "Synthetic deletion visitor",
        email: "deletion-visitor@example.test",
        message: "Disposable synthetic response",
      },
    },
  });
  expect(submitted.status()).toBe(201);

  await page.goto("/admin/forms");
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });
  const filtered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/admin/inbox" &&
      url.searchParams.get("formId") === form.id
    );
  });
  await row.getByRole("link", { name: "Responses", exact: true }).click();
  const responseData = (await (await filtered).json()) as InboxPage;
  expect(responseData.total).toBe(1);
  expect(
    responseData.messages.every((message) => message.formId === form.id),
  ).toBe(true);
  const source = page.getByRole("combobox", {
    name: "Source form",
    exact: true,
  });
  await expect(source).toHaveValue(form.id);
  await expect(
    page.getByText(`Responses for ${title}`, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(source).toHaveValue(form.id);
  await source.selectOption(otherFormId);
  await expect(page).toHaveURL(new RegExp(`formId=${otherFormId}`));
  await expect(source).toHaveValue(otherFormId);
  await expect(
    page.getByRole("region", { name: "Responses", exact: true }),
  ).not.toContainText("deletion-visitor@example.test");
  await page
    .getByRole("button", { name: "View all forms", exact: true })
    .click();
  await expect(source).toHaveValue("");
  await page.goBack();
  await expect(source).toHaveValue(otherFormId);

  await page.goto(`/admin/forms/${form.id}`);
  await page.getByLabel(`Actions for ${title}`, { exact: true }).click();
  await page.getByRole("button", { name: "Archive form", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Archive form", exact: true })
    .getByRole("button", { name: "Archive form", exact: true })
    .click();
  await expect(
    page.getByText("Archived · read only", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All forms", exact: true }).click();
  await page
    .getByRole("group", { name: "Filter forms by status", exact: true })
    .getByRole("button", { name: /^Archived/ })
    .click();
  await row.getByLabel(`Actions for ${title}`, { exact: true }).click();
  await row
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Permanently delete form",
    exact: true,
  });
  await expect(dialog).toContainText("1 response and 1 published version");
  await expect(
    dialog.getByRole("button", { name: "Delete permanently", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Keep archived", exact: true })
    .click();
  expect((await page.request.get(`/api/admin/forms/${form.id}`)).status()).toBe(
    200,
  );
  expect(
    (
      await visitor.request.delete(`/api/admin/forms/${form.id}`, {
        headers: { origin },
        data: { expectedRevision: 2, expectedResponses: 1, confirmed: true },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.delete(`/api/admin/forms/${form.id}`, {
        headers: { origin: "https://untrusted.example" },
        data: { expectedRevision: 2, expectedResponses: 1, confirmed: true },
      })
    ).status(),
  ).toBe(403);
  await row
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await dialog
    .getByRole("checkbox", {
      name: "I understand this cannot be undone.",
      exact: true,
    })
    .check();
  await dialog.screenshot({
    path: ".local/form-permanent-deletion-review.png",
  });
  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      new URL(response.url()).pathname === `/api/admin/forms/${form.id}`,
  );
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  expect((await deleted).status()).toBe(200);
  await expect(row).toHaveCount(0);
  expect((await page.request.get(`/api/admin/forms/${form.id}`)).status()).toBe(
    404,
  );
  expect((await visitor.request.get(`/api/forms/${form.id}`)).status()).toBe(
    404,
  );
}
