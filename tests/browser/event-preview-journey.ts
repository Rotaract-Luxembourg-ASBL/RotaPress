import { expect, type Page } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";

/** Unsaved input traverses the authorized endpoint and the real server renderer. */
export async function eventPreviewJourney(
  editor: Page,
  visitor: Page,
  id: string,
) {
  const before = (await editor.request
    .get(`/api/admin/cms/content/${id}?locale=en`)
    .then((r) => r.json())) as CmsDetail;
  await editor.getByRole("button", { name: "Content", exact: true }).click();
  await editor
    .getByRole("button", { name: "Add section", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Add Rich text", exact: true })
    .click();
  const richTextPanel = editor.getByRole("region", {
    name: "Rich text editor",
    exact: true,
  });
  const richText = richTextPanel.locator(
    '.tiptap.ProseMirror[contenteditable="true"]',
  );
  const enteredText = "A gathering shaped by our community.";
  await richText.click();
  await richText.press("ControlOrMeta+a");
  await richText.pressSequentially(enteredText);
  await richText.press("ControlOrMeta+a");
  await richTextPanel
    .getByRole("button", { name: "Bold", exact: true })
    .click();
  // Switching immediately must flush the last input and formatting to the draft.
  await editor
    .getByRole("button", { name: "Edit Heading", exact: true })
    .click();
  await editor
    .getByRole("textbox", { name: "Heading text", exact: true })
    .fill("Unsaved community preview");
  await editor
    .locator("summary")
    .filter({ hasText: /^Section appearance$/ })
    .click();
  await editor
    .getByRole("combobox", { name: "Section background", exact: true })
    .selectOption("soft");
  await editor
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  const dialog = editor.getByRole("dialog", {
    name: "Preview changes",
    exact: true,
  });
  const frame = dialog.frameLocator('iframe[title="Unsaved website preview"]');
  await expect(frame.locator(".cms-richtext strong")).toHaveText(enteredText);
  await expect(
    frame.getByRole("heading", {
      name: "Unsaved community preview",
      exact: true,
    }),
  ).toBeVisible();
  const url = await dialog.locator("iframe").getAttribute("src");
  const response = await editor.request.get(url!);
  expect(response.headers()["cache-control"]).toMatch(/no-store/);
  expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'self'",
  );
  expect(
    (await editor.request.get("/admin")).headers()["x-frame-options"],
  ).toBe("DENY");
  await visitor.goto(url!);
  await expect(visitor).toHaveURL(/\/sign-in/);
  const current = (await editor.request
    .get(`/api/admin/cms/content/${id}?locale=en`)
    .then((r) => r.json())) as CmsDetail;
  expect(current.draft.id).toBe(before.draft.id);
  await editor.screenshot({ path: ".local/event-unsaved-desktop.png" });
  await dialog.getByRole("button", { name: "Phone", exact: true }).click();
  await expect(dialog.locator("iframe")).toHaveCSS("width", "390px");
  await editor.screenshot({ path: ".local/event-unsaved-phone.png" });
  await dialog
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await expect(
    editor.getByRole("combobox", { name: "Section background", exact: true }),
  ).toHaveValue("soft");
  await expect(
    editor.getByRole("textbox", { name: "Heading text", exact: true }),
  ).toHaveValue("Unsaved community preview");
  await editor
    .getByRole("textbox", { name: "Heading text", exact: true })
    .fill("Together in our community");
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    editor.getByText("Draft saved. Your public page has not changed."),
  ).toBeVisible();
}
