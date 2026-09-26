import { expect, type Page } from "@playwright/test";
import type { WebsiteWorkspace } from "../../src/features/cms/website_setup_schemas";

export async function saveWebsiteSettings(page: Page) {
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByText("Website settings saved. Publish the website when ready.", {
      exact: true,
    }),
  ).toBeVisible();
}

export async function publishWebsite(page: Page) {
  await page
    .getByRole("button", { name: "Publish website", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Publish website",
    exact: true,
  });
  await dialog.getByRole("radio", { name: /^Entire website/ }).check();
  const confirm = dialog.getByRole("button", {
    name: "Publish reviewed website",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await dialog
    .getByRole("checkbox", {
      name: "I reviewed this website and want to make these saved changes public.",
      exact: true,
    })
    .check();
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText(
      "Website published. Visitors now see your saved pages, menu and design.",
      { exact: true },
    ),
  ).toBeVisible();
}

/** Complete website setup extends B02; catalogue previews never install records. */
export async function websiteWorkspaceJourney(page: Page, visitor: Page) {
  const workspace = async () =>
    (await page.request
      .get("/api/admin/cms/website?locale=en")
      .then((response) => response.json())) as WebsiteWorkspace;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/website?tab=templates");
  const before = await workspace();
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Rotary Template", exact: true }),
  });
  const previewPromise = page.waitForEvent("popup");
  await card
    .getByRole("link", { name: "Preview template", exact: true })
    .click();
  const preview = await previewPromise;
  await expect(preview.locator(".cms-public")).toHaveAttribute(
    "data-theme",
    "rotary-service",
  );
  await preview
    .locator("header")
    .getByRole("link", { name: "About", exact: true })
    .click();
  await expect(preview).toHaveURL(/template=rotary-service.*recipe=about/);
  await preview
    .locator("header")
    .getByRole("link", { name: "Calendar", exact: true })
    .click();
  await expect(
    preview.getByRole("region", { name: "Community calendar" }),
  ).toBeVisible();
  await preview
    .locator("header")
    .getByRole("link", { name: "Contact", exact: true })
    .click();
  await expect(
    preview.getByRole("textbox", { name: /Your message/ }),
  ).toBeVisible();
  await expect(
    preview.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  const response = await page.request.get(
    new URL(preview.url()).pathname + new URL(preview.url()).search,
  );
  expect(response.headers()["cache-control"]).toContain("no-store");
  await preview.screenshot({
    path: ".local/website-template-preview-desktop.png",
  });
  await preview.close();
  expect(await workspace()).toEqual(before);
  await visitor.goto(
    "/admin/website/preview?template=rotary-service&locale=en",
  );
  await expect(visitor).toHaveURL(/\/sign-in/);
  await card
    .getByRole("button", { name: "Use Rotary Template", exact: true })
    .click();
  const setup = page.getByRole("dialog", {
    name: "Use Rotary Template",
    exact: true,
  });
  await setup
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  expect(await workspace()).toEqual(before);
  await card
    .getByRole("button", { name: "Use Rotary Template", exact: true })
    .click();
  await setup
    .getByRole("button", { name: "Set up my website", exact: true })
    .click();
  await expect(setup).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Rotary Template", exact: true }),
  ).toBeVisible();
  const selected = await workspace();
  expect(selected.selection?.contentIds).toHaveLength(13);
  expect(selected.site.published).toEqual(before.site.published);
  expect(selected.contents).toHaveLength(before.contents.length + 13);
  expect(selected.site.draft.headerId).toBeTruthy();
  expect(selected.site.draft.footerId).toBeTruthy();
  expect(selected.site.draft.navigation).toHaveLength(7);
  const calendarPage = selected.contents.find(
    (item) =>
      item.title === "Calendar" &&
      selected.selection?.contentIds.includes(item.id),
  )!;
  await page.goto(`/admin/website/${calendarPage.id}?locale=en`);
  await page.getByRole("button", { name: "Add blocks", exact: true }).click();
  const library = page.getByRole("complementary", {
    name: "Block library",
    exact: true,
  });
  await expect(
    library.getByRole("heading", {
      name: "Projects, calendar & events",
      exact: true,
    }),
  ).toBeVisible();
  await library
    .getByRole("searchbox", { name: "Search blocks", exact: true })
    .fill("contact");
  await expect(
    library.getByRole("button", { name: "Add Form block", exact: true }),
  ).toBeVisible();
  await library
    .getByRole("searchbox", { name: "Search blocks", exact: true })
    .fill("calendar");
  await library
    .getByRole("button", { name: "Add Calendar block", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill("Our next activities");
  await page
    .getByRole("combobox", { name: "Starting view", exact: true })
    .selectOption({ label: "Agenda" });
  await expect(
    page.getByRole("link", { name: "Manage calendars ↗", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Our next activities", exact: true }),
  ).toBeVisible();
  await page.goto("/admin/website");
  await page
    .getByRole("navigation", { name: "Website management" })
    .getByRole("button", { name: "Pages", exact: true })
    .click();
  const pages = page.getByRole("region", {
    name: "Website pages",
    exact: true,
  });
  await expect(
    pages.getByRole("combobox", { name: "Collection", exact: true }),
  ).toHaveValue("website");
  await pages.getByRole("button", { name: "New page", exact: true }).click();
  const newPage = page.getByRole("dialog", { name: "New page", exact: true });
  await expect(
    newPage.getByRole("combobox", { name: /^Page layout/ }),
  ).toHaveValue("blank");
  await expect(
    newPage.getByRole("option", { name: "Home", exact: true }),
  ).toHaveAttribute("value", "rotary-service:home");
  await newPage
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Website management" })
    .getByRole("button", { name: "Menus", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Link label", exact: true })
    .nth(1)
    .fill("About our club");
  await page
    .getByRole("button", { name: "Move menu link 2 down", exact: true })
    .click();
  await saveWebsiteSettings(page);
  await expect(
    page.getByRole("link", { name: "Design Events directory", exact: true }),
  ).toHaveAttribute("href", "/admin/events?tab=directory");
  await page
    .getByRole("navigation", { name: "Website management" })
    .getByRole("button", { name: "Header & footer", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Edit header", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Edit footer", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Footer text", exact: true })
    .fill("Synthetic complete website footer");
  await saveWebsiteSettings(page);
  const draftPreviewPromise = page.waitForEvent("popup");
  await page
    .getByRole("link", { name: "Preview website", exact: true })
    .click();
  const draftPreview = await draftPreviewPromise;
  await expect(draftPreview.locator(".cms-public")).toHaveAttribute(
    "data-theme",
    "rotary-service",
  );
  await expect(
    draftPreview
      .locator("header")
      .getByRole("link", { name: "About our club", exact: true }),
  ).toBeVisible();
  await expect(draftPreview.locator("footer")).toContainText(
    "Synthetic complete website footer",
  );
  await draftPreview.close();
  expect((await workspace()).site.published).toEqual(before.site.published);
  await page
    .getByRole("navigation", { name: "Website management" })
    .getByRole("button", { name: "Search & sharing", exact: true })
    .click();
  await page
    .getByLabel("Default search description", { exact: true })
    .fill("A synthetic club search summary.");
  await saveWebsiteSettings(page);
  const contactId = selected.site.draft.contactFormId!;
  const draftContact = selected.contents.find(
    (item) =>
      item.title === "Contact" &&
      selected.selection?.contentIds.includes(item.id),
  )!;
  await page.goto(`/admin/website/${draftContact.id}?locale=en`);
  await expect(
    page.getByRole("region", { name: "Club form preview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  await page.goto(`/admin/forms/${contactId}`);
  await page.getByRole("button", { name: "Publish form", exact: true }).click();
  await expect(
    page.getByText(
      "Form published. Visitors now see your latest saved version.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.goto("/admin/website");
  await publishWebsite(page);
  await visitor.setViewportSize({ width: 1440, height: 1000 });
  const eventsPage = selected.contents.find(
    (item) => item.id === selected.site.draft.eventsPageId,
  )!;
  await visitor.goto(`/pages/en/${eventsPage.slug}`);
  await expect(visitor).toHaveURL(/\/events\?locale=en$/);
  await expect(
    visitor
      .locator("header")
      .getByRole("link", { name: "Events", exact: true }),
  ).toHaveAttribute("href", "/events?locale=en");
  const contactPage = selected.contents.find(
    (item) =>
      item.title === "Contact" &&
      selected.selection?.contentIds.includes(item.id),
  )!;
  await visitor.goto(`/pages/en/${contactPage.slug}`);
  await expect(
    visitor.getByRole("heading", { name: "Contact the club", exact: true }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("textbox", { name: /Your message/ }),
  ).toBeVisible();
  await visitor.setViewportSize({ width: 1440, height: 1000 });
  await visitor.goto("/");
  await expect(visitor.locator(".cms-public")).toHaveAttribute(
    "data-theme",
    "rotary-service",
  );
  await expect(
    visitor
      .locator("header")
      .getByRole("link", { name: "About our club", exact: true }),
  ).toBeVisible();
  await expect(visitor.locator("footer")).toContainText(
    "Synthetic complete website footer",
  );
  const published = await workspace();
  expect(published.site.published?.navigation).toEqual(
    published.site.draft.navigation,
  );
  for (const content of published.contents.filter((item) =>
    published.selection?.contentIds.includes(item.id),
  ))
    expect(content.publishedRevisionId).toBe(content.draftRevisionId);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width !== 320)
      await page.screenshot({
        path: `.local/website-workspace-${width === 1440 ? "desktop" : "phone"}.png`,
        fullPage: true,
        mask: [page.locator(".admin-account")],
      });
  }
}
