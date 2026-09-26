import { expect, type Page } from "@playwright/test";
import type { ProjectDto } from "../../src/features/projects/project_schemas";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { saveWebsiteSettings } from "./website-workspace-journey";

/** B02: the complete project story flow, saved/public boundaries and phone layout. */
export async function projectsJourney(page: Page, publicPage: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect((await publicPage.request.get("/api/admin/projects")).status()).toBe(
    401,
  );
  expect((await publicPage.request.get("/projects?q=a&q=b")).status()).toBe(
    200,
  );
  await page.route(
    "**/api/admin/projects",
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Project list is temporarily unavailable.",
        }),
      });
    },
    { times: 1 },
  );
  await page.goto("/admin/projects");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tell the story of your first project" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "New project", exact: true });
  await dialog
    .getByRole("textbox", { name: "Project title", exact: true })
    .fill("Cancelled unsaved project");
  page.removeAllListeners("dialog");
  page.once("dialog", (event) => event.dismiss());
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    dialog.getByRole("textbox", { name: "Project title", exact: true }),
  ).toHaveValue("Cancelled unsaved project");
  page.on("dialog", (event) => event.accept());
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const empty = await page.request.get("/api/admin/projects");
  expect(((await empty.json()) as { items: ProjectDto[] }).items).toHaveLength(
    0,
  );
  await page.getByRole("button", { name: "New project", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "New project", exact: true });
  await dialog
    .getByRole("textbox", { name: "Project title", exact: true })
    .fill("Riverside volunteer project");
  await dialog
    .getByRole("textbox", { name: "Short summary", exact: true })
    .fill("Volunteers care for a shared riverside space.");
  await dialog
    .getByRole("button", { name: "Create draft", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const initial = (await page.request
    .get(`/api/admin/projects/${id}`)
    .then((response) => response.json())) as ProjectDto;
  expect(
    (await publicPage.request.get(`/projects/${initial.slug}`)).status(),
  ).toBe(404);
  await page
    .getByRole("textbox", { name: "Project story", exact: true })
    .fill(
      "We brought neighbours together to care for the riverside.\n\nThis story is still private.",
    );
  await page
    .getByRole("combobox", { name: "Progress", exact: true })
    .selectOption("completed");
  await page
    .getByRole("textbox", { name: "Location", exact: true })
    .fill("Riverside park");
  await page.getByLabel("Start date", { exact: true }).fill("2026-09-20");
  await page.getByLabel("End date", { exact: true }).fill("2026-09-20");
  await page
    .getByRole("textbox", { name: "Results and impact", exact: true })
    .fill("The paths are ready for the community to enjoy.");
  await page
    .getByRole("button", { name: "Preview project", exact: true })
    .click();
  const preview = page.getByRole("region", {
    name: "Private project preview",
    exact: true,
  });
  await expect(
    preview.getByRole("heading", {
      name: "Riverside volunteer project",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    preview.getByText("This story is still private.", { exact: false }),
  ).toBeVisible();
  await preview.getByRole("button", { name: "Phone", exact: true }).click();
  await expect(preview.locator(".project-draft-preview")).toHaveAttribute(
    "data-width",
    "phone",
  );
  await page.getByRole("button", { name: "Edit story", exact: true }).click();
  page.removeAllListeners("dialog");
  page.once("dialog", (event) => event.dismiss());
  await page
    .getByRole("link", { name: "Back to projects", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Location", exact: true }),
  ).toHaveValue("Riverside park");
  page.on("dialog", (event) => event.accept());
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/projects$/);
  await page.getByRole("link", { name: "Edit project", exact: true }).click();
  await expect(
    page.getByText(
      "Your unsaved project edits were recovered in this tab. Review and save them before leaving.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Location", exact: true }),
  ).toHaveValue("Riverside park");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. The public project has not changed."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Location", exact: true }),
  ).toHaveValue("Riverside park");
  await page.screenshot({
    path: ".local/feedback-captures/projects-editor-desktop.png",
    fullPage: true,
    mask: [page.locator(".admin-account")],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/feedback-captures/projects-editor-phone.png",
    fullPage: true,
    mask: [page.locator(".admin-account")],
  });
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Publish project", exact: true })
    .getByRole("button", { name: "Confirm publication", exact: true })
    .click();
  await expect(
    page.getByText("Project published. Visitors can now see this saved story."),
  ).toBeVisible();
  await publicPage.goto(`/projects/${initial.slug}`);
  await expect(
    publicPage.getByRole("heading", {
      name: "Riverside volunteer project",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    publicPage.getByText("The paths are ready for the community to enjoy.", {
      exact: true,
    }),
  ).toBeVisible();
  await publicPage.setViewportSize({ width: 1440, height: 1000 });
  await publicPage.screenshot({
    path: ".local/feedback-captures/projects-public-desktop.png",
    fullPage: true,
  });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  expect(
    await publicPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await publicPage.screenshot({
    path: ".local/feedback-captures/projects-public-phone.png",
    fullPage: true,
  });
  const showcasePath = await projectShowcase(page);
  await publicPage.goto(showcasePath);
  await expect(
    publicPage.getByRole("heading", {
      name: "Riverside volunteer project",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    publicPage.getByRole("link", {
      name: "Riverside volunteer project",
      exact: true,
    }),
  ).toHaveAttribute("href", `/projects/${initial.slug}`);
  await page
    .getByRole("textbox", { name: "Project title", exact: true })
    .fill("Private project title replacement");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. The public project has not changed."),
  ).toBeVisible();
  await publicPage.reload();
  await expect(
    publicPage.getByRole("heading", {
      name: "Riverside volunteer project",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    publicPage.getByText("Private project title replacement", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("More project actions", { exact: true }).click();
  await page
    .getByRole("button", { name: "Unpublish project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm unpublication", exact: true })
    .click();
  await expect(
    page.getByText("Project unpublished. Your saved draft is kept."),
  ).toBeVisible();
  expect(
    (await publicPage.request.get(`/projects/${initial.slug}`)).status(),
  ).toBe(404);
  const actions = page.getByLabel("More project actions", { exact: true });
  await actions.focus();
  await actions.press("Escape");
  await actions.press("Enter");
  const actionMenu = page.getByRole("group", {
    name: "More project actions options",
    exact: true,
  });
  await expect(
    actionMenu.getByRole("button", { name: "Archive project", exact: true }),
  ).toBeVisible();
  expect(
    await actionMenu.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth;
    }),
  ).toBe(true);
  await actions.press("Escape");
  await expect(actionMenu).toBeHidden();
  await expect(actions).toBeFocused();
  await actions.click();
  await page
    .getByRole("button", { name: "Archive project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(
    page.getByText(
      "Project archived. It is private and can be restored later.",
    ),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Back to projects", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Project filters" })
    .getByRole("button", { name: /^Archived/ })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Project collection", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(1);
  await page
    .getByRole("searchbox", { name: "Search projects", exact: true })
    .fill("no matching project qzxw");
  await expect(
    page.getByRole("heading", { name: "No matching projects", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search projects", exact: true })
    .fill("");
  await page.getByRole("link", { name: "View project", exact: true }).click();
  await page
    .getByRole("button", { name: "Restore project", exact: true })
    .click();
  await expect(
    page.getByText(
      "Project restored as a private draft. Review it before publishing again.",
    ),
  ).toBeVisible();
  expect(
    (await publicPage.request.get(`/projects/${initial.slug}`)).status(),
  ).toBe(404);
  await page
    .getByRole("link", { name: "Back to projects", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".local/feedback-captures/projects-library-desktop.png",
    fullPage: true,
    mask: [page.locator(".admin-account")],
  });
  await projectMenu(page, publicPage);
}

async function projectShowcase(page: Page) {
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, {
      headers: { origin: smokeOrigin },
      data,
    });
    expect(response.ok(), `${path}: ${response.status()}`).toBe(true);
    return response.json() as Promise<CmsDetail>;
  };
  let showcase = await post("/api/admin/cms/content", {
    kind: "page",
    locale: "en",
    title: "Our volunteer impact",
    slug: "volunteer-impact",
  });
  showcase = await post(`/api/admin/cms/content/${showcase.id}/save`, {
    locale: "en",
    expectedRevisionId: showcase.draft.id,
    title: "Our volunteer impact",
    slug: "volunteer-impact",
    description: "Published project stories",
    socialImageId: null,
    data: {
      root: { props: {} },
      content: [
        {
          type: "ProjectCollection",
          props: {
            id: "project-collection",
            version: 1,
            title: "Our impact",
            introduction: "The difference volunteers make.",
            status: "all",
            limit: 6,
          },
        },
      ],
    },
  });
  await post(`/api/admin/cms/content/${showcase.id}/publish`, {
    locale: "en",
    expectedRevisionId: showcase.draft.id,
  });
  return "/pages/en/volunteer-impact";
}

async function projectMenu(page: Page, visitor: Page) {
  await visitor.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/website?tab=menus");
  await page
    .getByRole("button", { name: "Add navigation link", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Link label", exact: true })
    .last()
    .fill("Our projects");
  await page
    .getByRole("combobox", { name: "Destination", exact: true })
    .last()
    .selectOption("projects");
  await saveWebsiteSettings(page);
  await page
    .getByRole("button", { name: "Publish website", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Publish website",
    exact: true,
  });
  await review.getByRole("radio", { name: /^Menu only/ }).check();
  await review
    .getByRole("checkbox", {
      name: "I reviewed this menu and want to make these saved choices public.",
      exact: true,
    })
    .check();
  await review
    .getByRole("button", { name: "Publish reviewed menu", exact: true })
    .click();
  await expect(review).toHaveCount(0);
  await visitor.goto("/projects");
  await expect(
    visitor
      .locator("header")
      .getByRole("link", { name: "Our projects", exact: true })
      .first(),
  ).toHaveAttribute("href", "/projects");
}
