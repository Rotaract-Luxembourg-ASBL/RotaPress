import { expect, type Page } from "@playwright/test";
import type { SubmissionList } from "../../src/features/forms/form_types";

/** B01 uses the enquiry already submitted: archive retains it, restore stays draft. */
export async function formRemovalJourney(
  manager: Page,
  visitor: Page,
  eventId: string,
  title: string,
) {
  await manager.goto(`/admin/events/${eventId}?tab=participation`);
  const panel = manager.getByRole("region", {
    name: "Event forms and registration",
    exact: true,
  });
  const row = panel
    .getByRole("listitem")
    .filter({ has: manager.getByRole("link", { name: title, exact: true }) });
  const href = await row
    .getByRole("link", { name: title, exact: true })
    .getAttribute("href");
  const formId = href!.split("/").at(-1)!;
  const submissions = async () => {
    const result = (await manager.request
      .get(`/api/admin/forms/${formId}/submissions`)
      .then((response) => response.json())) as SubmissionList;
    return result.submissions.map((submission) => submission.id);
  };
  const before = await submissions();
  expect(before).toHaveLength(1);
  await row.getByLabel(`Actions for ${title}`, { exact: true }).click();
  await row.getByRole("button", { name: "Archive form", exact: true }).click();
  const removal = manager.getByRole("dialog", {
    name: "Archive form",
    exact: true,
  });
  await expect(removal.getByText(/does not permanently delete/)).toBeVisible();
  await removal.getByRole("button", { name: "Keep form", exact: true }).click();
  expect((await visitor.request.get(`/api/forms/${formId}`)).status()).toBe(
    200,
  );
  await row.getByRole("button", { name: "Archive form", exact: true }).click();
  await removal.screenshot({ path: ".local/form-removal-review.png" });
  await removal
    .getByRole("button", { name: "Archive form", exact: true })
    .click();
  await expect(removal).toHaveCount(0);
  await expect(row).toHaveCount(0);
  expect((await visitor.request.get(`/api/forms/${formId}`)).status()).toBe(
    404,
  );
  expect(await submissions()).toEqual(before);
  await panel
    .getByRole("combobox", { name: "View event forms", exact: true })
    .selectOption("archived");
  await row.getByLabel(`Actions for ${title}`, { exact: true }).click();
  await row.getByRole("button", { name: "Restore form", exact: true }).click();
  const restoration = manager.getByRole("dialog", {
    name: "Restore form",
    exact: true,
  });
  await restoration
    .getByRole("button", { name: "Restore form", exact: true })
    .click();
  await expect(restoration).toHaveCount(0);
  await expect(row).toHaveCount(0);
  expect((await visitor.request.get(`/api/forms/${formId}`)).status()).toBe(
    404,
  );
  expect(await submissions()).toEqual(before);
  await panel
    .getByRole("combobox", { name: "View event forms", exact: true })
    .selectOption("active");
  await row.getByRole("link", { name: title, exact: true }).click();
  await manager
    .getByRole("button", { name: "Publish form", exact: true })
    .click();
  await expect(
    manager.getByText(
      "Form published. Visitors now see your latest saved version.",
    ),
  ).toBeVisible();
  expect((await visitor.request.get(`/api/forms/${formId}`)).status()).toBe(
    200,
  );
  await manager
    .getByRole("link", { name: "Back to event", exact: true })
    .click();
}
