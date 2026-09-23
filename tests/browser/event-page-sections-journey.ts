import { expect, type Page } from "@playwright/test";

/** B01 edits actual section data, then restores presentation without losing it. */
export async function eventPageSectionsJourney(editor: Page) {
  await editor
    .getByRole("button", { name: "Add section", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Add Programme", exact: true })
    .click();
  await editor
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill("Afternoon programme");
  const programme = editor.getByRole("region", {
    name: "Programme items",
    exact: true,
  });
  await programme.getByRole("button", { name: /^Add / }).click();
  await programme
    .getByRole("textbox", { name: "Time or day", exact: true })
    .fill("16:00");
  await programme
    .getByRole("textbox", { name: "Activity", exact: true })
    .fill("Welcome and introductions");
  await programme
    .getByRole("textbox", { name: "Details", exact: true })
    .fill("Meet the synthetic event team.");
  await editor
    .getByRole("button", { name: "Add section", exact: true })
    .click();
  await editor.getByRole("button", { name: "Add FAQ", exact: true }).click();
  const questions = editor.getByRole("region", {
    name: "Questions",
    exact: true,
  });
  await questions.getByRole("button", { name: /^Add / }).click();
  await questions
    .getByRole("textbox", { name: "Question", exact: true })
    .fill("What should I bring?");
  await questions
    .getByRole("textbox", { name: "Answer", exact: true })
    .fill("Bring comfortable shoes.");

  await editor
    .getByRole("button", { name: "Page layout", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Move FAQ up", exact: true })
    .click();
  await editor
    .getByRole("checkbox", { name: "Show Programme", exact: true })
    .uncheck();
  await editor
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  const preview = editor.getByRole("dialog", {
    name: "Preview changes",
    exact: true,
  });
  const frame = preview.frameLocator('iframe[title="Unsaved website preview"]');
  await expect(
    frame
      .locator(".cms-faq")
      .getByText("What should I bring?", { exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByRole("heading", { name: "Afternoon programme", exact: true }),
  ).toHaveCount(0);
  await preview
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await editor
    .getByRole("checkbox", { name: "Show Programme", exact: true })
    .check();
  await editor.getByRole("button", { name: "Content", exact: true }).click();
  await editor
    .getByRole("navigation", { name: "Event page editor", exact: true })
    .getByRole("button", { name: "Edit Programme", exact: true })
    .click();
  await expect(
    programme.getByRole("textbox", { name: "Activity", exact: true }),
  ).toHaveValue("Welcome and introductions");
  await editor
    .getByRole("button", { name: "Theme & appearance", exact: true })
    .click();
  await editor
    .getByRole("combobox", { name: "Colour palette", exact: true })
    .selectOption("warm");
  await editor.getByLabel("Accent colour", { exact: true }).fill("#7f1d1d");
  await editor
    .getByRole("combobox", { name: "Font style", exact: true })
    .selectOption("classic");
  await editor
    .getByRole("combobox", { name: "Content width", exact: true })
    .selectOption("focused");
}

export async function publicClubStyle(page: Page) {
  return page.locator(".public-site").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      accent: style.getPropertyValue("--club-accent"),
      font: style.fontFamily,
      background: style.backgroundColor,
      color: style.color,
    };
  });
}
