import { expect, type Page } from "@playwright/test";

/** B01's existing Luma event: local package publication never visits a provider. */
export async function eventPackagesJourney(
  manager: Page,
  visitor: Page,
  eventId: string,
) {
  const originalPublicUrl = visitor.url();
  const title = "Synthetic community package";
  const destination = "https://luma.com/rotapress-synthetic-package-standard";
  const publicUrl = `/events/${eventId}/en/website`;
  const openPackages = async () => {
    await manager.setViewportSize({ width: 1440, height: 1000 });
    await manager.goto(`/admin/events/${eventId}?tab=packages`);
    await expect(
      manager.getByRole("region", { name: "Event packages", exact: true }),
    ).toBeVisible();
  };
  await openPackages();
  const sources = manager.getByRole("region", {
    name: "External checkout sources",
    exact: true,
  });
  const addSource = sources.getByRole("form", {
    name: "Add external source",
    exact: true,
  });
  for (const [label, url] of [
    ["Synthetic standard checkout", destination],
    [
      "Synthetic alternative checkout",
      "https://lu.ma/rotapress-synthetic-package-alternative",
    ],
  ]) {
    await addSource
      .getByRole("textbox", { name: "New source label", exact: true })
      .fill(label);
    await addSource
      .getByRole("textbox", { name: "Luma checkout URL", exact: true })
      .fill(url);
    await addSource
      .getByRole("button", { name: "Add external source", exact: true })
      .click();
    await expect(
      sources.getByRole("form", { name: `Source ${label}`, exact: true }),
    ).toBeVisible();
  }
  await expect(
    sources
      .getByRole("form", {
        name: "Source Synthetic alternative checkout",
        exact: true,
      })
      .getByRole("textbox", { name: "Source URL", exact: true }),
  ).toHaveValue("https://luma.com/rotapress-synthetic-package-alternative");
  const editor = manager.getByRole("region", {
    name: "Package editor",
    exact: true,
  });
  await editor
    .getByRole("textbox", { name: "Package title", exact: true })
    .fill(title);
  await editor
    .getByRole("textbox", { name: "Package description", exact: true })
    .fill("An illustrative local offer. No actual purchase is made.");
  await editor
    .getByRole("textbox", { name: "Price", exact: true })
    .fill("25.00");
  await editor
    .getByRole("checkbox", { name: "Display this price publicly", exact: true })
    .check();
  await editor
    .getByRole("combobox", { name: "External checkout source", exact: true })
    .selectOption({ label: "Synthetic standard checkout" });
  await editor
    .getByRole("checkbox", { name: "Enable external checkout", exact: true })
    .check();
  await editor
    .getByRole("button", { name: "Create package draft", exact: true })
    .click();
  await expect(
    manager.getByText(
      "Package draft saved. The published offer has not changed.",
      { exact: true },
    ),
  ).toBeVisible();
  await visitor.goto(publicUrl);
  await expect(
    visitor.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  await Promise.all([
    manager.waitForEvent("dialog").then((dialog) => dialog.accept()),
    editor
      .getByRole("button", { name: "Publish package", exact: true })
      .click(),
  ]);
  await expect(
    manager.getByText("Package published.", { exact: true }),
  ).toBeVisible();
  await editor
    .getByRole("heading", { name: "Edit package", exact: true })
    .scrollIntoViewIfNeeded();
  await manager.screenshot({
    path: ".local/event-packages-editor-desktop.png",
  });
  await manager.setViewportSize({ width: 320, height: 844 });
  expect(
    await manager.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await editor
    .getByRole("heading", { name: "Edit package", exact: true })
    .scrollIntoViewIfNeeded();
  await manager.screenshot({ path: ".local/event-packages-editor-phone.png" });
  await editor
    .getByRole("button", { name: "Publish package", exact: true })
    .scrollIntoViewIfNeeded();
  await manager.screenshot({ path: ".local/event-packages-actions-phone.png" });
  await manager.setViewportSize({ width: 1440, height: 1000 });

  // Package publication and CMS placement are separate, reviewed actions.
  await manager
    .getByRole("button", { name: "Event page", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Add section", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Add Published packages", exact: true })
    .click();
  await manager
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill("Choose a synthetic package");
  await manager
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  const preview = manager.getByRole("dialog", {
    name: "Preview changes",
    exact: true,
  });
  const frame = preview.frameLocator('iframe[title="Unsaved website preview"]');
  const previewPackages = frame.getByRole("region", {
    name: "Published packages preview",
    exact: true,
  });
  await expect(
    previewPackages.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    previewPackages.getByRole("button", {
      name: "Continue to Luma",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    previewPackages.getByRole("link", {
      name: "Continue to Luma",
      exact: true,
    }),
  ).toHaveCount(0);
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
  await Promise.all([
    manager.waitForEvent("dialog").then((dialog) => dialog.accept()),
    manager
      .getByRole("button", { name: "Publish changes", exact: true })
      .click(),
  ]);
  await expect(
    manager.getByText("Published. Guests now see this event and page.", {
      exact: true,
    }),
  ).toBeVisible();
  await visitor.reload();
  const packages = visitor.getByRole("region", {
    name: "Published packages",
    exact: true,
  });
  const outbound = packages.getByRole("link", {
    name: "Continue to Luma",
    exact: true,
  });
  await expect(
    packages.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(packages.getByText("€25.00", { exact: true })).toBeVisible();
  await expect(outbound).toHaveAttribute("href", destination);
  await expect(outbound).toHaveAttribute("rel", "noopener noreferrer");
  await expect(outbound).toHaveAttribute("referrerpolicy", "no-referrer");
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
    await packages.screenshot({
      path: `.local/event-packages-public-${device}.png`,
    });
  }

  // Editing a package and disabling a source have deliberately different effects.
  await openPackages();
  await editor
    .getByRole("textbox", { name: "Package title", exact: true })
    .fill("Unpublished package wording");
  await editor
    .getByRole("textbox", { name: "Price", exact: true })
    .fill("30.00");
  await editor
    .getByRole("button", { name: "Save package draft", exact: true })
    .click();
  await expect(
    manager.getByText(
      "Package draft saved. The published offer has not changed.",
      { exact: true },
    ),
  ).toBeVisible();
  await visitor.reload();
  await expect(
    packages.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    packages.getByRole("heading", {
      name: "Unpublished package wording",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(packages.getByText("€25.00", { exact: true })).toBeVisible();
  const source = sources.getByRole("form", {
    name: "Source Synthetic standard checkout",
    exact: true,
  });
  await expect(
    source.getByRole("textbox", { name: "Source URL", exact: true }),
  ).toHaveAttribute("readonly", "");
  await source
    .getByRole("checkbox", { name: "Enabled source", exact: true })
    .uncheck();
  await Promise.all([
    manager.waitForEvent("dialog").then((dialog) => dialog.accept()),
    source.getByRole("button", { name: "Save source", exact: true }).click(),
  ]);
  await expect(
    manager.getByText("External source updated.", { exact: true }),
  ).toBeVisible();
  await visitor.reload();
  await expect(
    packages.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(outbound).toHaveCount(0);
  await visitor.goto(originalPublicUrl);
  await manager.goto(`/admin/events/${eventId}?tab=participation`);
}
