import { expect, type Page } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import type { FormDto } from "../../src/features/forms/form_types";

/** B02: edit nested content and connect a real private source without leaving the draft. */
export async function editorWorkflowJourney(
  page: Page,
  visitor: Page,
  origin: string,
) {
  const createForm = await page.request.post("/api/admin/forms", {
    headers: { origin },
    data: {
      kind: "contact",
      templateId: "contact",
      title: "Editor connected contact",
    },
  });
  expect(createForm.status()).toBe(201);
  const form = (await createForm.json()) as FormDto;
  const createPage = await page.request.post("/api/admin/cms/content", {
    headers: { origin },
    data: {
      kind: "page",
      locale: "en",
      title: "Editor workflow",
      slug: "editor-workflow",
      templateId: "blank",
    },
  });
  expect(createPage.status()).toBe(201);
  const content = (await createPage.json()) as CmsDetail;
  const url = `/admin/website/${content.id}?locale=en`;
  const library = page.getByRole("complementary", { name: "Block library" });
  const categories = library.getByRole("group", { name: "Block categories" });
  const search = library.getByRole("searchbox", { name: "Search blocks" });
  const location = page.getByRole("navigation", {
    name: "Selected block location",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  await expect(page.locator(".editor-toolbar")).toBeVisible();
  if (!(await library.isVisible()))
    await page.getByRole("button", { name: "Add blocks", exact: true }).click();
  await categories.getByRole("button", { name: /^Connected / }).click();
  await search.fill("no-such-block-synthetic");
  await expect(
    library.getByRole("heading", { name: "No blocks found" }),
  ).toBeVisible();
  await library
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(search).toHaveValue("");
  await categories.getByRole("button", { name: /^Layout / }).click();
  await library
    .getByRole("button", { name: "Add Content columns block", exact: true })
    .click();
  await page.getByRole("button", { name: "Add blocks", exact: true }).click();
  await library.getByLabel("Insertion position", { exact: true }).click();
  await library
    .getByRole("combobox", { name: "Insert into", exact: true })
    .selectOption({ label: "Content columns 1 · left column" });
  await search.fill("heading");
  await library
    .getByRole("button", { name: "Add Heading block", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Heading text", exact: true })
    .fill("Inside the left column");
  await page.getByRole("radio", { name: "Heading 3", exact: true }).focus();
  await page.keyboard.press("Space");
  await page
    .getByRole("button", { name: "Undo block edit", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Heading 2", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("textbox", { name: "Heading text", exact: true }),
  ).toHaveValue("Inside the left column");
  await expect(location).toContainText("left column");
  await expect(location).toContainText("Block 1");

  // Before/after placement must stay within the selected child block's column.
  await page
    .getByRole("button", { name: "Add block before Heading", exact: true })
    .click();
  await library
    .getByRole("button", { name: "Add Divider block", exact: true })
    .click();
  await page.locator(".editor-canvas .cms-heading h2").click();
  await page
    .getByRole("button", { name: "Add block after Heading", exact: true })
    .click();
  await library
    .getByRole("button", { name: "Add Spacer block", exact: true })
    .click();
  await page.locator(".editor-canvas .cms-heading h2").click();
  await location
    .getByRole("button", { name: "Content columns", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Content columns", exact: true }),
  ).toBeVisible();
  await page.locator(".editor-canvas .cms-heading h2").click();

  // Changing inspector tabs preserves the selected block and unsaved values.
  const pageTab = page.getByRole("tab", { name: "Page", exact: true });
  await pageTab.focus();
  await pageTab.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Block", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Heading text", exact: true }),
  ).toHaveValue("Inside the left column");

  // The canvas-end action means the whole page, even with a nested block selected.
  await page
    .getByRole("button", { name: "Add a block here", exact: true })
    .click();
  await library.getByLabel("Insertion position", { exact: true }).click();
  await expect(
    library.getByRole("combobox", { name: "Insert into", exact: true }),
  ).toHaveValue("root:default-zone");
  await categories.getByRole("button", { name: /^Connected / }).click();
  await search.fill("form");
  await expect(
    library.getByRole("button", { name: "Add Form block", exact: true }),
  ).toContainText("Forms");
  await page.route(
    `${origin}/api/admin/forms`,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Forms are temporarily unavailable. Try again.",
        }),
      }),
    { times: 1 },
  );
  await library
    .getByRole("button", { name: "Add Form block", exact: true })
    .click();
  const connection = page.getByRole("region", { name: "Forms connection" });
  await expect(connection).toContainText("Connection unavailable");
  await expect(
    page.locator(".editor-connection-picker").getByRole("alert"),
  ).toContainText("Forms are temporarily unavailable");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const source = page.getByRole("combobox", {
    name: "Reusable form",
    exact: true,
  });
  await expect(source).toBeEnabled();
  await source.selectOption(form.id);
  await expect(connection).toContainText("Draft only");
  const editSource = connection.getByRole("link", {
    name: "Edit questions & design",
    exact: true,
  });
  await expect(editSource).toHaveAttribute("href", `/admin/forms/${form.id}`);
  await expect(editSource).toHaveAttribute("target", "_blank");
  await expect(
    page
      .getByRole("region", { name: "Club form preview", exact: true })
      .getByRole("heading", { name: "Editor connected contact", exact: true }),
  ).toBeVisible();
  // The async form grows beyond its loading placeholder. Selection and insertion
  // must follow the complete preview, including its normal section margin.
  await expect
    .poll(
      async () => {
        const preview = await page
          .getByRole("region", { name: "Club form preview", exact: true })
          .boundingBox();
        const after = await page
          .getByRole("button", { name: "Add block after Form", exact: true })
          .boundingBox();
        if (!preview || !after) return false;
        const gap = after.y + after.height / 2 - (preview.y + preview.height);
        return gap >= -2 && gap <= 64;
      },
      { message: "The insertion boundary follows the complete loaded form" },
    )
    .toBe(true);
  await page.screenshot({ path: ".local/editor-connected-desktop.png" });

  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  const saved = (await page.request
    .get(`/api/admin/cms/content/${content.id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  expect(saved.draft.data.content.map((block) => block.type)).toEqual([
    "Columns",
    "Form",
  ]);
  const columns = saved.draft.data.content[0];
  if (columns.type !== "Columns") throw new Error("Expected content columns");
  expect(columns.props.left.map((block) => block.type)).toEqual([
    "Divider",
    "Heading",
    "Spacer",
  ]);
  expect(columns.props.right).toHaveLength(0);
  expect(columns.props.left[1].props).toMatchObject({
    text: "Inside the left column",
  });
  expect(saved.draft.data.content[1].props).toMatchObject({ formId: form.id });
  expect(
    (await visitor.request.get("/pages/en/editor-workflow")).status(),
  ).toBe(404);
  expect((await visitor.request.get(`/api/forms/${form.id}`)).status()).toBe(
    404,
  );

  await page.reload();
  await page
    .getByRole("region", { name: "Club form preview", exact: true })
    .getByRole("heading", { name: "Editor connected contact", exact: true })
    .click();
  await expect(source).toHaveValue(form.id);
  await expect(connection).toContainText("Draft only");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Page", exact: true }).click();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  const outline = page.getByRole("complementary", { name: "Page outline" });
  await outline.getByRole("button", { name: "Form", exact: true }).click();
  await expect(outline).not.toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Block", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(source).toBeVisible();
  await page.screenshot({ path: ".local/editor-connected-phone.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await source.press("Escape");
  const reopen = page.getByRole("button", {
    name: "Block settings",
    exact: true,
  });
  await expect(reopen).toBeFocused();
  await reopen.click();
  await expect(source).toHaveValue(form.id);
  await page.getByRole("button", { name: "Add blocks", exact: true }).click();
  await categories.getByRole("button", { name: /^Connected / }).click();
  await search.fill("calendar");
  await expect(
    library.getByRole("button", { name: "Add Calendar block", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/editor-library-phone.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await search.press("Escape");
  await expect(
    page.getByRole("button", { name: "Add blocks", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
}
