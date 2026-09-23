import { expect, type Page } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import type { PartnerDto } from "../../src/features/partners/partner_schemas";

export async function partnersJourney(
  page: Page,
  publicPage: Page,
  origin: string,
) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/partners");
  await expect(
    page.getByRole("heading", { name: "Community directory", exact: true }),
  ).toBeVisible();
  const adminBefore = await page
    .locator(".admin-layout")
    .evaluate((element) => ({
      font: getComputedStyle(element).fontFamily,
      color: getComputedStyle(element).color,
    }));
  expect((await publicPage.request.get("/api/admin/partners")).status()).toBe(
    401,
  );
  expect(
    (await publicPage.request.get("/api/admin/partners/selection")).status(),
  ).toBe(401);
  await page.getByRole("button", { name: "New profile", exact: true }).click();
  let dialog = page.getByRole("dialog", {
    name: "New directory profile",
    exact: true,
  });
  await dialog
    .getByLabel("Organization name", { exact: true })
    .fill("Synthetic Community Partner");
  await dialog
    .getByLabel("Public description", { exact: true })
    .fill("A synthetic profile used to verify shared website content.");
  await dialog
    .getByLabel("Website link", { exact: true })
    .fill("https://example.test");
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  dialog = page.getByRole("dialog", {
    name: "Edit shared profile",
    exact: true,
  });
  await expect(
    dialog.getByText("Draft saved. The public profile is unchanged."),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Preview profile", exact: true })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Private profile preview" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Phone", exact: true }).click();
  await expect(dialog.locator(".partner-preview")).toHaveAttribute(
    "data-width",
    "phone",
  );
  await dialog
    .getByRole("button", { name: "Review publication", exact: true })
    .click();
  await expect(
    dialog.getByText(/Publish “Synthetic Community Partner”/),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Confirm publication", exact: true })
    .click();
  await expect(
    dialog.getByText("Profile published across its selected placements."),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  const records = (await page.request
    .get("/api/admin/partners")
    .then((response) => response.json())) as { items: PartnerDto[] };
  const shared = records.items.find(
    (item) => item.draft.name === "Synthetic Community Partner",
  )!;
  const secondResponse = await page.request.post("/api/admin/partners", {
    headers: { origin },
    data: {
      name: "Synthetic Local Sponsor",
      category: "sponsor",
      description: "A second synthetic record for responsive layout checks.",
      website: "",
      logoId: null,
    },
  });
  expect(secondResponse.status()).toBe(201);
  const second = (await secondResponse.json()) as PartnerDto;
  expect(
    (
      await page.request.post(`/api/admin/partners/${second.id}/publish`, {
        headers: { origin },
        data: { expectedVersion: second.version, confirmed: true },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByText("Synthetic Local Sponsor", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/partners-library-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".local/partners-library-phone.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  const created = await page.request.post("/api/admin/cms/content", {
    headers: { origin },
    data: {
      kind: "page",
      locale: "en",
      title: "Community connections",
      slug: "community-connections",
    },
  });
  expect(created.status()).toBe(201);
  let cmsPage = (await created.json()) as CmsDetail;
  const saved = await page.request.post(
    `/api/admin/cms/content/${cmsPage.id}/save`,
    {
      headers: { origin },
      data: {
        locale: "en",
        expectedRevisionId: cmsPage.draft.id,
        title: cmsPage.draft.title,
        slug: cmsPage.draft.slug,
        description: "",
        socialImageId: null,
        data: {
          root: { props: {} },
          content: [
            {
              type: "Hero",
              props: {
                id: "community-hero",
                version: 1,
                title: "A community built together.",
                body: "Synthetic demonstration of shared profiles and editable section design.",
                buttonLabel: "Meet our club",
                buttonHref: "/",
                design: { tone: "dark", spacing: "comfortable" },
              },
            },
          ],
        },
      },
    },
  );
  expect(saved.ok()).toBe(true);
  cmsPage = (await saved.json()) as CmsDetail;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/admin/website/${cmsPage.id}?locale=en`);
  await page.getByRole("button", { name: "Add blocks", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Directory profiles block", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Add a published profile", exact: true })
    .selectOption(shared.id);
  await page
    .getByRole("combobox", { name: "Add a published profile", exact: true })
    .selectOption(second.id);
  await page.getByRole("radio", { name: "Profile cards", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("radio", { name: "Profile cards", exact: true }),
  ).toBeChecked();
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Section background", exact: true })
    .selectOption("soft");
  await page
    .getByRole("combobox", { name: "Section spacing", exact: true })
    .selectOption("comfortable");
  await page
    .getByRole("combobox", { name: "Columns on desktop", exact: true })
    .selectOption("two");
  await expect(
    page.locator(".editor-canvas .cms-design[data-tone='soft']"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await publicPage.request.get("/pages/en/community-connections")).status(),
  ).toBe(404);
  await page.locator(".editor-canvas .cms-partners > h2").click();
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Columns on desktop", exact: true }),
  ).toHaveValue("two");
  await page.screenshot({
    path: ".local/block-design-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Mobile canvas width", exact: true })
    .click();
  await expect(page.locator(".editor-canvas")).toHaveAttribute(
    "data-width",
    "mobile",
  );
  await page.screenshot({
    path: ".local/block-design-mobile-preview.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("combobox", { name: "Section background", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/block-design-phone.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByText("Published. The website now shows this saved revision.", {
      exact: true,
    }),
  ).toBeVisible();
  await publicPage.setViewportSize({ width: 1440, height: 1000 });
  await publicPage.goto("/pages/en/community-connections");
  await expect(
    publicPage.getByRole("heading", { name: shared.draft.name, exact: true }),
  ).toBeVisible();
  const layout = await publicPage
    .locator(".cms-partners .cms-card-grid")
    .evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length,
    );
  expect(layout).toBe(2);
  await publicPage.screenshot({
    path: ".local/partners-page-desktop.png",
    fullPage: true,
  });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  expect(
    await publicPage
      .locator(".cms-partners .cms-card-grid")
      .evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(1);
  expect(
    await publicPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await publicPage.screenshot({
    path: ".local/partners-page-phone.png",
    fullPage: true,
  });

  await page.goto("/admin/partners");
  expect(
    await page.locator(".admin-layout").evaluate((element) => ({
      font: getComputedStyle(element).fontFamily,
      color: getComputedStyle(element).color,
    })),
  ).toEqual(adminBefore);
  await page
    .locator("li", { hasText: shared.draft.name })
    .getByRole("button", { name: "Edit profile", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Edit shared profile",
    exact: true,
  });
  await expect(
    dialog.getByRole("link", {
      name: "Community connections (en)",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByLabel("Organization name", { exact: true })
    .fill("Private partner replacement");
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    dialog.getByText("Draft saved. The public profile is unchanged."),
  ).toBeVisible();
  await publicPage.reload();
  await expect(
    publicPage.getByRole("heading", { name: shared.draft.name, exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByText("Private partner replacement", { exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Review publication", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirm publication", exact: true })
    .click();
  await expect(
    dialog.getByText("Profile published across its selected placements."),
  ).toBeVisible();
  await publicPage.reload();
  await expect(
    publicPage.getByRole("heading", {
      name: "Private partner replacement",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", {
      name: "Restore previous publication to draft",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByLabel("Organization name", { exact: true }),
  ).toHaveValue(shared.draft.name);
  await publicPage.reload();
  await expect(
    publicPage.getByRole("heading", {
      name: "Private partner replacement",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
}
