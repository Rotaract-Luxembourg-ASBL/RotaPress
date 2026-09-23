import { expect, type Page } from "@playwright/test";
import type { CmsDetail, SiteDraft } from "../../src/features/cms/cms_schemas";
import type { FormDto } from "../../src/features/forms/form_types";
import { websiteWorkspaceJourney } from "./website-workspace-journey";

export async function kitJourney(
  page: Page,
  visitor: Page,
  origin: string,
  assetId: string,
) {
  const forms = (await page.request
    .get("/api/admin/forms")
    .then((response) => response.json())) as { forms: FormDto[] };
  const contactFormId = forms.forms.find(
    (form) => form.kind === "contact" && form.publishedVersionId,
  )?.id;
  const membershipFormId = forms.forms.find(
    (form) => form.kind === "membership" && form.publishedVersionId,
  )?.id;
  expect(contactFormId).toBeTruthy();
  expect(membershipFormId).toBeTruthy();
  await page.goto("/admin/website?tab=appearance");
  const style = () =>
    page.locator(".admin-layout").evaluate((node) => ({
      font: getComputedStyle(node).fontFamily,
      color: getComputedStyle(node).color,
      background: getComputedStyle(node).backgroundColor,
    }));
  const originalStyle = await style();
  let site = (await page.request
    .get("/api/admin/cms/site?locale=en")
    .then((response) => response.json())) as SiteDraft;
  const originalSite = site.published;
  for (const kitId of ["rotary-service", "rotaract-action"]) {
    const response = await page.request.post("/api/admin/cms/kits", {
      headers: { origin },
      data: {
        kitId,
        namespace: kitId,
        locale: "en",
        recipes: [
          "header",
          "footer",
          "home",
          "projects",
          "project-detail",
          "contact",
          "join",
          "gallery",
        ],
        assets: [assetId],
        contactFormId,
        membershipFormId,
        confirmed: true,
      },
    });
    expect(response.ok()).toBe(true);
    const result = (await response.json()) as {
      items: { id: string; recipe: string }[];
    };
    const id = result.items.find((item) => item.recipe === "projects")!.id;
    await page.goto(`/admin/website/${id}?locale=en`);
    await page.locator(".cms-page-intro h1").click();
    await page
      .getByRole("textbox", { name: /^title$/i })
      .fill("Projects shaped by our community");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(
      page.getByText("Draft saved. Your public page has not changed.", {
        exact: true,
      }),
    ).toBeVisible();
    const saved = (await page.request
      .get(`/api/admin/cms/content/${id}?locale=en`)
      .then((response) => response.json())) as CmsDetail;
    expect(
      saved.draft.data.content.some(
        (block) =>
          block.type === "PageIntro" &&
          block.props.title === "Projects shaped by our community",
      ),
    ).toBe(true);
    expect(
      (await visitor.request.get(`/pages/en/${kitId}-projects`)).status(),
    ).toBe(404);
    await page.goto(
      `/admin/website/kits/${kitId}/preview?namespace=${kitId}&recipe=projects`,
    );
    await expect(
      page.getByRole("heading", { name: "Projects shaped by our community" }),
    ).toBeVisible();
    expect(
      (
        await visitor.request.post("/api/admin/cms/kits", {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(401);
    const draftResponse = await page.request.patch("/api/admin/cms/site", {
      headers: { origin },
      data: {
        locale: "en",
        expectedVersion: site.version,
        settings: { ...site.draft, themeId: kitId },
      },
    });
    expect(draftResponse.status()).toBe(200);
    site = (await draftResponse.json()) as SiteDraft;
    const activationResponse = await page.request.post(
      "/api/admin/cms/site/activate-appearance",
      {
        headers: { origin },
        data: { locale: "en", expectedVersion: site.version },
      },
    );
    expect(activationResponse.status()).toBe(200);
    site = (await activationResponse.json()) as SiteDraft;
    await page.goto("/admin/website?tab=appearance");
    expect(await style()).toEqual(originalStyle);
    expect(site.published?.navigation).toEqual(originalSite?.navigation);
    await visitor.goto("/unavailable-kit-page");
    await expect(visitor.locator(".cms-public")).toHaveAttribute(
      "data-theme",
      kitId,
    );
    await expect(
      visitor.getByRole("heading", {
        name: "This page is unavailable.",
        exact: true,
      }),
    ).toBeVisible();
    if (kitId === "rotary-service") {
      const contactId = result.items.find(
        (item) => item.recipe === "contact",
      )!.id;
      const contact = (await page.request
        .get(`/api/admin/cms/content/${contactId}?locale=en`)
        .then((response) => response.json())) as CmsDetail;
      const publication = await page.request.post(
        `/api/admin/cms/content/${contactId}/publish`,
        {
          headers: { origin },
          data: { locale: "en", expectedRevisionId: contact.draft.id },
        },
      );
      expect(publication.ok()).toBe(true);
      await visitor.goto(`/pages/en/${kitId}-contact`);
      const form = visitor.locator(".cms-columns .forms-public");
      await form
        .getByLabel("Your name", { exact: false })
        .fill("Synthetic kit visitor");
      await form
        .getByLabel("Your email", { exact: false })
        .fill("kit-visitor@example.test");
      await form
        .getByLabel("Your message", { exact: false })
        .fill("Local kit contact journey.");
      await form
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      await expect(
        form.getByText("Your message has been received.", { exact: true }),
      ).toBeVisible();
    }
  }
  await websiteWorkspaceJourney(page, visitor);
}
