import { expect, type Locator, type Page } from "@playwright/test";

async function confirm(page: Page, button: Locator) {
  await Promise.all([
    page.waitForEvent("dialog").then((dialog) => dialog.accept()),
    button.click(),
  ]);
}

/** Extends B01's real manager session, published event and synthetic public image. */
export async function eventPrizesJourney(
  manager: Page,
  visitor: Page,
  eventId: string,
  pageId: string,
) {
  const title = "Synthetic community prize";
  const revisedTitle = "Revised synthetic community prize";
  const publicUrl = `/events/${eventId}/en/website`;
  const editorUrl = `/admin/events/${eventId}/page/${pageId}?locale=en`;
  await manager.setViewportSize({ width: 1440, height: 1000 });
  await manager.goto(`/admin/events/${eventId}?tab=features`);
  await confirm(
    manager,
    manager.getByRole("button", { name: "Add Prizes", exact: true }),
  );
  const panel = manager.getByRole("region", {
    name: "Event prizes",
    exact: true,
  });
  const editor = panel.getByRole("region", {
    name: "Prize editor",
    exact: true,
  });
  const titleInput = editor.getByRole("textbox", {
    name: "Prize title",
    exact: true,
  });
  await expect(titleInput).toBeEnabled();
  await titleInput.fill(title);
  await editor
    .getByRole("textbox", { name: "Prize description", exact: true })
    .fill(
      "An illustrative prize for this local gallery. No draw is being run.",
    );
  await editor
    .getByRole("spinbutton", { name: "Quantity", exact: true })
    .fill("2");
  await editor
    .getByRole("button", { name: "Choose image", exact: true })
    .click();
  const picker = manager.getByRole("dialog", {
    name: "Choose an image",
    exact: true,
  });
  await expect(
    picker.getByRole("tab", { name: "Upload image", exact: true }),
  ).toHaveCount(0);
  await picker.getByRole("button", { name: /Synthetic event image/ }).click();
  await picker
    .getByRole("button", { name: "Insert image", exact: true })
    .click();
  await editor
    .getByRole("textbox", { name: "Image description", exact: true })
    .fill("Synthetic green prize illustration");
  await editor
    .getByRole("button", { name: "Preview prize", exact: true })
    .click();
  await expect(
    editor
      .getByRole("region", { name: "Private prize preview", exact: true })
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await editor
    .getByRole("button", { name: "Create prize draft", exact: true })
    .click();
  await expect(
    panel.getByText(
      "Prize draft saved. The published gallery has not changed.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(titleInput).toHaveValue(title);
  await visitor.goto(publicUrl);
  await expect(
    visitor.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  await confirm(
    manager,
    editor.getByRole("button", { name: "Publish prize", exact: true }),
  );
  await expect(
    panel.getByText("Prize published.", { exact: true }),
  ).toBeVisible();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 320],
  ] as const) {
    await manager.setViewportSize({ width, height: 844 });
    await editor
      .getByRole("heading", { name: "Edit prize", exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await manager.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (device === "phone") {
      await editor
        .getByRole("heading", { name: "Edit prize", exact: true })
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
    }
    await manager.screenshot({
      path: `.local/event-prizes-editor-${device}.png`,
    });
    if (device === "phone") {
      await editor
        .getByRole("spinbutton", { name: "Quantity", exact: true })
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
      await manager.screenshot({
        path: ".local/event-prizes-editor-phone-actions.png",
      });
    }
  }
  await manager.setViewportSize({ width: 1440, height: 1000 });

  // Prize publication remains independent from placement and page publication.
  await manager.goto(editorUrl);
  await manager
    .getByRole("button", { name: "Add section", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Add Published prizes", exact: true })
    .click();
  await manager
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill("Prizes from our community");
  await manager
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  const preview = manager.getByRole("dialog", {
    name: "Preview changes",
    exact: true,
  });
  const frame = preview.frameLocator('iframe[title="Unsaved website preview"]');
  await expect(
    frame
      .getByRole("region", { name: "Published prizes preview", exact: true })
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await preview
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(
    manager.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  await visitor.reload();
  await expect(
    visitor.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  await confirm(
    manager,
    manager.getByRole("button", { name: "Publish changes", exact: true }),
  );
  await expect(
    manager.getByText("Published. Guests now see this event and page.", {
      exact: true,
    }),
  ).toBeVisible();
  await visitor.reload();
  const gallery = visitor.getByRole("region", {
    name: "Published prizes",
    exact: true,
  });
  await expect(
    gallery.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(gallery.getByText("Quantity: 2", { exact: true })).toBeVisible();
  await expect(
    gallery.getByRole("img", {
      name: "Synthetic green prize illustration",
      exact: true,
    }),
  ).toBeVisible();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 320],
  ] as const) {
    await visitor.setViewportSize({ width, height: 844 });
    expect(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await gallery.screenshot({
      path: `.local/event-prizes-public-${device}.png`,
    });
  }

  await manager.goto(`/admin/events/${eventId}?tab=prizes`);
  await titleInput.fill(revisedTitle);
  // Hidden workspace panels retain input across tab navigation.
  await manager
    .getByRole("button", { name: "Event details", exact: true })
    .click();
  await manager.getByRole("button", { name: "Prizes", exact: true }).click();
  await expect(titleInput).toHaveValue(revisedTitle);
  await editor
    .getByRole("button", { name: "Save prize draft", exact: true })
    .click();
  await expect(
    panel.getByText(
      "Prize draft saved. The published gallery has not changed.",
      { exact: true },
    ),
  ).toBeVisible();
  await visitor.reload();
  await expect(
    gallery.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    gallery.getByRole("heading", { name: revisedTitle, exact: true }),
  ).toHaveCount(0);
  await confirm(
    manager,
    panel.getByRole("button", { name: "Disable Prizes", exact: true }),
  );
  await expect(titleInput).toBeDisabled();
  await visitor.reload();
  await expect(gallery).toHaveCount(0);
  // Authorized removal remains available when the feature is disabled.
  await confirm(
    manager,
    editor.getByRole("button", {
      name: "Remove from published gallery",
      exact: true,
    }),
  );
  await expect(
    panel.getByText(
      "Prize removed from the published gallery. Its draft is retained.",
      { exact: true },
    ),
  ).toBeVisible();
  await confirm(
    manager,
    panel.getByRole("button", { name: "Enable Prizes", exact: true }),
  );
  await expect(titleInput).toBeEnabled();
  await expect(titleInput).toHaveValue(revisedTitle);
  await visitor.reload();
  await expect(gallery).toHaveCount(0);
  await confirm(
    manager,
    editor.getByRole("button", { name: "Publish prize", exact: true }),
  );
  await expect(
    panel.getByText("Prize published.", { exact: true }),
  ).toBeVisible();
  await visitor.reload();
  await expect(
    gallery.getByRole("heading", { name: revisedTitle, exact: true }),
  ).toBeVisible();
  await visitor.setViewportSize({ width: 1440, height: 1000 });
  await manager.goto(`/admin/events/${eventId}?tab=participation`);
  await expect(
    manager.getByRole("region", {
      name: "Event forms and registration",
      exact: true,
    }),
  ).toBeVisible();
}
