import { expect, type Page } from "@playwright/test";
import type { FormDto } from "../../src/features/forms/form_types";

/** B02: author, preview, publish, respond and duplicate through the real workflow. */
export async function formStudioJourney(page: Page, visitor: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/forms");
  await page.getByRole("button", { name: "New form", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Create a form" });
  await create
    .getByRole("searchbox", { name: "Search form templates" })
    .fill("Event feedback");
  await create.getByRole("button", { name: /^Event feedback/ }).click();
  await create
    .getByRole("button", { name: "Continue with Event feedback" })
    .click();
  await create
    .getByLabel("Form title", { exact: true })
    .fill("Synthetic advanced feedback");
  await create
    .getByRole("button", { name: "Create draft", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Synthetic advanced feedback",
      level: 1,
    }),
  ).toBeVisible();
  const build = page.getByRole("tabpanel", { name: "Build", exact: true });
  await build
    .getByRole("button", { name: "Add element", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Add an element" })
    .getByRole("button", { name: "Time Choose a time of day", exact: true })
    .click();
  await page.getByLabel("Field label", { exact: true }).fill("Preferred time");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Field label", { exact: true })).toHaveValue(
    "Time",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel("Field label", { exact: true })).toHaveValue(
    "Preferred time",
  );
  const handle = build.getByRole("button", {
    name: "Drag Preferred time to reorder",
    exact: true,
  });
  const target = build.locator(".form-canvas-element").first();
  // Start the native drag before scrolling to a distant target. dragTo scrolls
  // both locators first, leaving a long form's source outside the viewport.
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  if (!from) throw new Error("The drag handle is not visible.");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2 + 12,
    from.y + from.height / 2 - 12,
    { steps: 5 },
  );
  await target.scrollIntoViewIfNeeded();
  const to = await target.boundingBox();
  if (!to) throw new Error("The drop target is not visible.");
  await page.mouse.move(to.x + to.width / 2, to.y + 30, { steps: 10 });
  await page.mouse.up();
  await expect(build.locator(".form-canvas-element").first()).toContainText(
    "Preferred time",
  );
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: "Ocean", exact: true }).click();
  const design = page.getByRole("tabpanel", { name: "Design", exact: true });
  await expect(design.locator(".form-preview-sheet")).toHaveAttribute(
    "data-form-theme",
    "ocean",
  );
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("tabpanel", { name: "Preview", exact: true });
  await preview.getByRole("radio", { name: "4", exact: true }).check();
  await preview.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(preview.getByText("Step 2 of 2", { exact: true })).toBeVisible();
  await preview
    .getByRole("button", { name: "Send response", exact: true })
    .click();
  await expect(
    preview.getByText("Thank you. Your response has been received.", {
      exact: true,
    }),
  ).toBeVisible();
  const publishedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/publish") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publish form", exact: true }).click();
  const form = (await (await publishedResponse).json()) as FormDto;
  await expect(
    page.getByText(
      "Form published. Visitors now see your latest saved version.",
      { exact: true },
    ),
  ).toBeVisible();
  await visitor.goto(`/forms/${form.id}`);
  await expect(visitor.locator(".forms-public").first()).toHaveAttribute(
    "data-form-theme",
    "ocean",
  );
  await visitor.getByRole("radio", { name: "4", exact: true }).check();
  await visitor.getByRole("checkbox", { name: "People", exact: true }).check();
  await visitor
    .getByRole("checkbox", { name: "Activities", exact: true })
    .check();
  await visitor.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(visitor.getByLabel("Your email (required)")).toHaveCount(0);
  await visitor
    .getByRole("checkbox", { name: "I would like a reply", exact: true })
    .check();
  await visitor
    .getByLabel("Your email (required)")
    .fill("synthetic-studio@example.test");
  const submitted = visitor.waitForResponse(
    (response) =>
      response.url().endsWith(`/forms/${form.id}/submit`) &&
      response.request().method() === "POST",
  );
  await visitor
    .getByRole("button", { name: "Send response", exact: true })
    .click();
  expect((await submitted).status()).toBe(201);
  await page.getByRole("link", { name: "View responses", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`formId=${form.id}`));
  await expect(
    page
      .getByRole("region", { name: "Matching response counts" })
      .locator("strong")
      .first(),
  ).toHaveText("1");
  const { forms } = (await page.request
    .get("/api/admin/forms")
    .then((response) => response.json())) as { forms: FormDto[] };
  expect(forms.find((item) => item.id === form.id)?.responses).toEqual({
    total: 1,
    new: 1,
  });
  await page.goto(`/admin/forms/${form.id}`);
  await page
    .getByLabel("Actions for Synthetic advanced feedback", { exact: true })
    .click();
  const duplicated = page.waitForResponse(
    (response) =>
      response.url().endsWith("/duplicate") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Duplicate form", exact: true })
    .click();
  const copy = (await (await duplicated).json()) as FormDto;
  await expect(page).toHaveURL(new RegExp(`/admin/forms/${copy.id}$`));
  expect(copy.publishedVersionId).toBeNull();
  expect((await visitor.request.get(`/api/forms/${copy.id}`)).status()).toBe(
    404,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^Edit question 2:/ }).click();
  await expect(page.getByLabel("Field label", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/form-studio-phone.png",
    fullPage: true,
    mask: [page.locator(".admin-account")],
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".local/form-studio-desktop.png",
    fullPage: true,
    mask: [page.locator(".admin-account")],
  });
}
