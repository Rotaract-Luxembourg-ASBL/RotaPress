import { expect, type Page } from "@playwright/test";

/** B01's real event manager, synthetic participants and local purchase fixture. */
export async function eventEntriesJourney(
  manager: Page,
  visitor: Page,
  eventId: string,
  guestId: string,
) {
  const url = `/admin/events/${eventId}?tab=prizes&prizeView=entries`;
  const endpoint = `/api/admin/events/${eventId}/entries`;
  expect((await visitor.request.get(endpoint)).status()).toBe(401);
  await manager.goto(`/admin/events/${eventId}?tab=features`);
  await Promise.all([
    manager.waitForEvent("dialog").then((dialog) => dialog.accept()),
    manager.getByRole("button", { name: "Add Prizes", exact: true }).click(),
  ]);
  await manager.goto(url);
  const panel = manager.getByRole("region", {
    name: "Entries and review",
    exact: true,
  });
  await expect(
    panel.getByText("No entries yet", { exact: true }),
  ).toBeVisible();
  const add = panel.getByRole("button", {
    name: "Add demonstration entries",
    exact: true,
  });
  await add.click();
  await manager.keyboard.press("Escape");
  await expect(add).toBeFocused();
  await add.click();
  const create = manager.getByRole("dialog", {
    name: "Add demonstration entries",
    exact: true,
  });
  await create
    .getByRole("textbox", { name: "Test participant name", exact: true })
    .fill("Synthetic practice participant");
  await create
    .getByRole("textbox", { name: "Reference", exact: true })
    .fill("practice-browser");
  await create
    .getByRole("spinbutton", { name: "Number of entries", exact: true })
    .fill("3");
  await create
    .getByRole("textbox", {
      name: "Why are these entries being added?",
      exact: true,
    })
    .fill("Three invented entries for the local demonstration.");
  await create
    .getByRole("button", { name: "Add entries", exact: true })
    .click();
  await expect(create).toHaveCount(0);
  const manual = panel.getByRole("listitem").filter({
    has: manager.getByText("Synthetic practice participant", { exact: true }),
  });
  await expect(
    manual.getByText("Ready for demo", { exact: true }),
  ).toBeVisible();
  await manual
    .getByRole("button", {
      name: "Review entries for Synthetic practice participant",
      exact: true,
    })
    .click();
  const review = manager.getByRole("dialog", {
    name: "Review entries",
    exact: true,
  });
  await review
    .getByRole("combobox", { name: "Decision", exact: true })
    .selectOption("hold");
  await review
    .getByRole("textbox", { name: "Reason for this decision", exact: true })
    .fill("Practice checking a participant before using entries.");
  await review
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  await expect(manual.getByText("On hold", { exact: true })).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Show", exact: true })
    .selectOption("held");
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await panel
    .getByRole("combobox", { name: "Show", exact: true })
    .selectOption("all");
  await add.click();
  await create
    .getByRole("combobox", { name: "Starting point", exact: true })
    .selectOption("purchase");
  await create
    .getByRole("combobox", { name: "Test booking", exact: true })
    .selectOption(guestId);
  await create
    .getByRole("combobox", { name: "Payment reference", exact: true })
    .selectOption({ index: 1 });
  await create
    .getByRole("spinbutton", { name: "Number of entries", exact: true })
    .fill("7");
  await create
    .getByRole("textbox", {
      name: "Why are these entries being added?",
      exact: true,
    })
    .fill("Seven entries deliberately selected for a synthetic purchase.");
  await create
    .getByRole("button", { name: "Add entries", exact: true })
    .click();
  await expect(create).toHaveCount(0);
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  const purchase = panel
    .getByRole("listitem")
    .filter({ hasText: "Test purchase" });
  await expect(
    purchase.getByText("Ready for demo", { exact: true }),
  ).toBeVisible();
  await purchase.getByRole("button", { name: /^Review entries for/ }).click();
  await review
    .getByRole("textbox", { name: "Reason for this decision", exact: true })
    .fill("Preserve this explanation if purchase details change.");
  // Real authenticated staff HTTP request races the open review; the form must not overwrite it.
  const purchaseEndpoint = `/api/admin/events/${eventId}/luma-guests/${guestId}/purchases`;
  const before = await manager.request
    .get(purchaseEndpoint)
    .then((response) => response.json());
  const refreshed = await manager.request.post(`${purchaseEndpoint}/refresh`, {
    headers: { Origin: new URL(manager.url()).origin },
    data: {
      expectedVersion: before.version,
      requestId: crypto.randomUUID(),
      confirmed: true,
    },
  });
  expect(refreshed.ok()).toBe(true);
  await review
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  await expect(review.getByRole("alert")).toContainText(
    "Purchase details changed while you were reviewing",
  );
  await expect(
    review.getByRole("textbox", {
      name: "Reason for this decision",
      exact: true,
    }),
  ).toHaveValue("Preserve this explanation if purchase details change.");
  await Promise.all([
    manager.waitForEvent("dialog").then((dialog) => dialog.accept()),
    review.getByRole("button", { name: "Cancel", exact: true }).click(),
  ]);
  await panel
    .getByRole("button", { name: "Refresh entries", exact: true })
    .click();
  await expect(purchase.getByText("On hold", { exact: true })).toBeVisible();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await manager.setViewportSize({ width, height: 1000 });
    await panel.scrollIntoViewIfNeeded();
    expect(
      await manager.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await manager.screenshot({ path: `.local/event-entries-${device}.png` });
    if (device === "phone") {
      await purchase.scrollIntoViewIfNeeded();
      await manager.screenshot({ path: ".local/event-entries-rows-phone.png" });
    }
  }
  await purchase.getByRole("button", { name: /^Review entries for/ }).click();
  await review
    .getByRole("combobox", { name: "Decision", exact: true })
    .selectOption("approve");
  await review
    .getByRole("textbox", { name: "Reason for this decision", exact: true })
    .fill(
      "Checked the latest saved purchase. The test allocation remains seven.",
    );
  await review.screenshot({ path: ".local/event-entry-review-phone.png" });
  await review
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  await expect(
    purchase.getByText("Ready for demo", { exact: true }),
  ).toBeVisible();
  await manager.reload();
  await expect(panel).toBeVisible();
  await manual.getByRole("button", { name: /^Review entries for/ }).click();
  await review
    .getByRole("combobox", { name: "Decision", exact: true })
    .selectOption("void");
  await expect(review.getByText(/excluded permanently/)).toBeVisible();
  await review
    .getByRole("textbox", { name: "Reason for this decision", exact: true })
    .fill("Finished the manual demonstration; retain its history.");
  await review
    .getByRole("button", { name: "Void entries", exact: true })
    .click();
  await expect(manual.getByText("Voided", { exact: true })).toBeVisible();
  await manual.getByRole("button", { name: /^View history for/ }).click();
  const history = manager.getByRole("dialog", {
    name: "Entry history",
    exact: true,
  });
  await history.getByText("Decision history (3)", { exact: true }).click();
  await expect(
    history.getByText("Three invented entries for the local demonstration.", {
      exact: true,
    }),
  ).toBeVisible();
  await history
    .getByRole("button", { name: "Close history", exact: true })
    .click();
  await manager.setViewportSize({ width: 1440, height: 1000 });
}
