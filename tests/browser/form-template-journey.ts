import { expect, type Page } from "@playwright/test";
import type { FormDto } from "../../src/features/forms/form_types";

/** Extend B02 with an ordinary private template draft and interactive preview. */
export async function formTemplateJourney(page: Page, visitor: Page) {
  await page.goto("/admin/forms");
  await page.getByRole("button", { name: "New form", exact: true }).click();
  const templates = page.getByRole("group", { name: "Form templates" });
  await expect(templates.getByRole("button")).toHaveCount(12);
  await templates.getByRole("button", { name: /^Volunteer interest / }).click();
  await page.getByRole("button", { name: /^Continue with/ }).click();
  await expect(page.locator(".forms-template-description")).toContainText(
    "Includes conditional questions",
  );
  await page
    .getByRole("textbox", { name: "Form title", exact: true })
    .fill("Synthetic volunteer interest");
  const created = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/admin/forms" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  const result = await created;
  expect(result.status()).toBe(201);
  const form = (await result.json()) as FormDto;
  expect(form.publishedVersionId).toBeNull();
  await expect(page).toHaveURL(new RegExp(`/admin/forms/${form.id}$`));
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  const preview = page
    .getByRole("tabpanel", { name: "Preview", exact: true })
    .locator(".forms-public");
  await expect(
    preview.getByRole("heading", {
      name: "Synthetic volunteer interest",
      exact: true,
    }),
  ).toBeVisible();
  const followup = preview.getByRole("textbox", {
    name: /Tell us how you would like to help/,
  });
  await expect(followup).toHaveCount(0);
  await page.getByRole("tab", { name: "Build", exact: true }).click();
  await page
    .getByRole("button", {
      name: /^Edit question \d+: Tell us how you would like to help$/,
    })
    .click();
  const followupEditor = page.locator(".forms-field-editor").filter({
    has: page.locator('input[value="Tell us how you would like to help"]'),
  });
  const rules = followupEditor.getByRole("region", {
    name: "Show only when conditions match",
    exact: true,
  });
  await rules
    .getByRole("combobox", { name: "Match", exact: true })
    .selectOption("any");
  await rules
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  const secondRule = rules.getByRole("group", {
    name: "Condition 2",
    exact: true,
  });
  await secondRule
    .getByRole("combobox", { name: "Question", exact: true })
    .selectOption("name");
  await secondRule
    .getByRole("textbox", { name: "Expected answer", exact: true })
    .fill("Synthetic helper");
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await preview
    .getByRole("textbox", { name: /Your name/ })
    .fill("Synthetic helper");
  await expect(followup).toBeVisible();
  await preview
    .getByRole("textbox", { name: /Your name/ })
    .fill("Someone else");
  await expect(followup).toHaveCount(0);
  await preview
    .getByRole("combobox", { name: /How would you like to help/ })
    .selectOption("Something else");
  await expect(followup).toBeVisible();
  await followup.fill("Synthetic preview answer only");
  await preview
    .getByRole("button", { name: "Clear preview answers", exact: true })
    .click();
  await expect(followup).toHaveCount(0);
  await page.getByRole("tab", { name: "Build", exact: true }).click();
  await page
    .getByRole("button", { name: /^Edit question \d+: Phone number$/ })
    .click();
  await page
    .getByRole("button", { name: "Duplicate Phone number", exact: true })
    .click();
  const copy = page.locator(".forms-field-editor").filter({
    has: page
      .getByRole("textbox", { name: "Field label", exact: true })
      .and(page.locator('input[value="Phone number (copy)"]')),
  });
  await expect(copy).toHaveCount(1);
  await copy
    .getByRole("textbox", { name: "Field label", exact: true })
    .fill("Alternative phone");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Publish when it is ready for visitors.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /^Edit question \d+: Alternative phone$/ })
    .click();
  await expect(
    page
      .getByRole("textbox", { name: "Field label", exact: true })
      .and(page.locator('input[value="Alternative phone"]')),
  ).toBeVisible();
  const saved = (await page.request
    .get(`/api/admin/forms/${form.id}`)
    .then((response) => response.json())) as FormDto;
  expect(saved.draft.fields).toHaveLength(7);
  expect(new Set(saved.draft.fields.map((field) => field.id)).size).toBe(7);
  expect(
    saved.draft.fields.find(
      (field) => field.label === "Tell us how you would like to help",
    )?.visibility,
  ).toMatchObject({
    mode: "any",
    rules: expect.arrayContaining([
      { fieldId: "name", operator: "equals", value: "Synthetic helper" },
    ]),
  });
  expect((await visitor.request.get(`/api/forms/${form.id}`)).status()).toBe(
    404,
  );
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await preview.screenshot({
    path: ".local/forms-template-preview-desktop.png",
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await preview.getByRole("heading").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/forms-template-preview-phone.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const origin = new URL(page.url()).origin;
  const createdPage = await page.request.post("/api/admin/cms/content", {
    headers: { origin },
    data: {
      kind: "page",
      locale: "en",
      title: "Volunteer form placement",
      slug: "volunteer-form-placement",
    },
  });
  expect(createdPage.status()).toBe(201);
  const cmsPage = (await createdPage.json()) as { id: string };
  await page.getByRole("tab", { name: "Share", exact: true }).click();
  await page
    .getByRole("button", { name: "Add to a website page", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Add form to a page", exact: true })
    .getByRole("link", { name: /Volunteer form placement/ })
    .click();
  await page
    .getByRole("button", { name: "Insert form block", exact: true })
    .click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  const placement = (await page.request
    .get(`/api/admin/cms/content/${cmsPage.id}?locale=en`)
    .then((response) => response.json())) as {
    draft: { data: { content: unknown[] } };
  };
  expect(placement.draft.data.content).toEqual([
    expect.objectContaining({
      type: "Form",
      props: expect.objectContaining({ formId: form.id }),
    }),
  ]);
  expect(
    (await visitor.request.get("/pages/en/volunteer-form-placement")).status(),
  ).toBe(404);
}
