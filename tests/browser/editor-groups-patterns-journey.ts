import { expect, type Page } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";

/** B02: groups persist through native saves; every saved pattern remains reachable. */
export async function editorGroupsPatternsJourney(
  page: Page,
  id: string,
  origin: string,
) {
  const canvas = page.frameLocator(".editor-canvas iframe");
  const outline = page.getByRole("complementary", { name: "Page outline" });
  const save = async () => {
    const response = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/admin/cms/content/${id}/save`) &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    expect((await response).ok()).toBe(true);
    await expect(
      page.getByText("Draft saved. Your public page has not changed.", {
        exact: true,
      }),
    ).toBeVisible();
  };
  await outline
    .getByRole("checkbox", { name: "Select all in this group" })
    .check();
  await outline.getByRole("button", { name: "Group", exact: true }).click();
  await expect(canvas.locator(".cms-columns-stacked")).toHaveCount(1);
  await expect(canvas.locator(".cms-heading")).toHaveCount(2);
  await save();
  let saved = (await page.request
    .get(`/api/admin/cms/content/${id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  expect(saved.draft.data.content[0]).toMatchObject({
    type: "Columns",
    props: { ratio: "stacked" },
  });
  await page.reload();
  await expect(canvas.locator(".cms-columns-stacked")).toHaveCount(1);
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await outline
    .getByRole("checkbox", { name: "Select all in this group" })
    .check();
  await outline.getByRole("button", { name: "Ungroup", exact: true }).focus();
  await page.keyboard.press("Control+Shift+g");
  await expect(canvas.locator(".cms-columns-stacked")).toHaveCount(0);
  await expect(canvas.locator(".cms-heading")).toHaveCount(2);
  await save();
  saved = (await page.request
    .get(`/api/admin/cms/content/${id}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  expect(saved.draft.data.content.map((block) => block.type)).toEqual([
    "Heading",
    "Heading",
  ]);

  const prefix = "Saved pattern browser fixture";
  for (let index = 1; index <= 13; index++) {
    const title = `${prefix} ${String(index).padStart(2, "0")}`;
    const response = await page.request.post("/api/admin/cms/patterns", {
      headers: { origin },
      data: {
        title,
        locale: "en",
        data: {
          root: { props: {} },
          content: [
            {
              type: "Heading",
              props: {
                id: `pattern-${index}`,
                version: 1,
                text: title,
                level: "h2",
              },
            },
          ],
        },
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  await page.getByRole("button", { name: "Add blocks", exact: true }).click();
  const library = page.getByRole("complementary", { name: "Block library" });
  await library.getByRole("searchbox", { name: "Search blocks" }).fill("");
  const patterns = library
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: /^Saved sections$/ }) });
  if ((await patterns.getAttribute("open")) === null)
    await patterns.locator("summary").click();
  await patterns
    .getByRole("searchbox", { name: "Find a section" })
    .fill(prefix);
  const pages = patterns.getByRole("navigation", { name: "Result pages" });
  await expect(pages).toContainText("of 13 saved sections");
  await expect(patterns.locator("article")).toHaveCount(12);
  await pages.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(pages).toContainText("Page 2 of 2");
  await expect(patterns.locator("article")).toHaveCount(1);
  await expect(patterns.locator("article")).toContainText(`${prefix} 13`);
  await page.getByRole("button", { name: "Add blocks", exact: true }).click();
  await page.getByRole("button", { name: "Add blocks", exact: true }).click();
  await expect(
    patterns.getByRole("searchbox", { name: "Find a section" }),
  ).toHaveValue(prefix);
  await expect(pages).toContainText("Page 2 of 2");
  await patterns
    .getByRole("searchbox", { name: "Find a section" })
    .fill(`${prefix} 13`);
  await expect(pages).toContainText("Page 1 of 1");
  await expect(pages).toContainText("of 1 saved sections");
  await patterns
    .getByRole("button", { name: "Insert independent copy", exact: true })
    .click();
  await expect(
    canvas.getByRole("heading", { name: `${prefix} 13`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Undo block edit", exact: true })
    .click();
  await expect(canvas.locator(".cms-heading")).toHaveCount(2);
  // Leave the principal journey at the same selection and document as it entered.
  if (!(await outline.isVisible()))
    await page.getByRole("button", { name: "List view", exact: true }).click();
}
