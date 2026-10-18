import { expect, type Page } from "@playwright/test";
import sharp from "sharp";
import type { CmsDetail, SiteDraft } from "../../src/features/cms/cms_schemas";
import type {
  FormDto,
  PublicFormDto,
} from "../../src/features/forms/form_types";
import type { MediaAssetDto } from "../../src/features/media/media_schemas";
import {
  publishWebsite,
  saveWebsiteSettings,
} from "./website-workspace-journey";

/** B02: review dependencies together; individual consent takes effect only on publish. */
export async function websitePublicationJourney(
  page: Page,
  visitor: Page,
  origin: string,
) {
  const current = async () =>
    (await page.request
      .get("/api/admin/cms/site?locale=en")
      .then((response) => response.json())) as SiteDraft;
  const before = await current();
  const uploaded = await page.request.post("/api/admin/media", {
    headers: { origin },
    multipart: {
      title: "Synthetic private favicon",
      visibility: "private",
      file: {
        name: "synthetic-favicon.png",
        mimeType: "image/png",
        buffer: await sharp({
          create: {
            width: 32,
            height: 32,
            channels: 3,
            background: "#245d68",
          },
        })
          .png()
          .toBuffer(),
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  const asset = (await uploaded.json()) as MediaAssetDto;
  expect(asset.visibility).toBe("private");
  const saved = await page.request.post("/api/admin/cms/site", {
    headers: { origin },
    data: {
      locale: "en",
      expectedVersion: before.version,
      settings: {
        ...before.draft,
        branding: { ...before.draft.branding, iconId: asset.id },
      },
    },
  });
  expect(saved.ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/website?tab=menus");
  await page
    .getByRole("textbox", { name: "Link label", exact: true })
    .first()
    .fill("Club home");
  await saveWebsiteSettings(page);
  const trigger = page.getByRole("button", {
    name: "Publish website",
    exact: true,
  });
  const dialog = page.getByRole("dialog", {
    name: "Publish website",
    exact: true,
  });
  const images = dialog.getByRole("region", { name: "Images to review" });
  const imageConsent = dialog.getByRole("checkbox", {
    name: `Make public: ${asset.title}`,
    exact: true,
  });
  const websiteConsent = dialog.getByRole("checkbox", {
    name: "I reviewed this website and want to make these saved changes public.",
    exact: true,
  });
  const publish = dialog.getByRole("button", {
    name: "Publish reviewed website",
    exact: true,
  });
  await trigger.click();
  await expect(dialog.getByRole("radio", { name: /^Menu only/ })).toBeChecked();
  await dialog.getByRole("radio", { name: /^Entire website/ }).check();
  await expect(images.getByText(asset.title, { exact: true })).toBeVisible();
  await expect(images.getByText(/Browser icon \(favicon\)/)).toBeVisible();
  await expect(imageConsent).not.toBeChecked();
  await expect(publish).toBeDisabled();
  await imageConsent.check();
  await dialog.getByRole("radio", { name: /^Menu only/ }).check();
  await expect(images).toHaveCount(0);
  await dialog.getByRole("radio", { name: /^Entire website/ }).check();
  await expect(imageConsent).not.toBeChecked();
  await dialog.getByRole("radio", { name: /^Menu only/ }).check();
  await dialog
    .getByRole("checkbox", {
      name: "I reviewed this menu and want to make these saved choices public.",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Publish reviewed menu", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Menu published. Your other saved changes remain drafts.", {
      exact: true,
    }),
  ).toBeVisible();
  const afterMenu = await current();
  expect(afterMenu.published?.navigation[0].label).toBe("Club home");
  expect(afterMenu.published?.branding).toEqual(before.published?.branding);
  expect(afterMenu.draft.branding.iconId).toBe(asset.id);
  expect((await visitor.request.get(`/media/${asset.id}`)).status()).toBe(404);
  await visitor.setViewportSize({ width: 1440, height: 1000 });
  await visitor.goto("/");
  await expect(
    visitor
      .locator("header")
      .getByRole("link", { name: "Club home", exact: true }),
  ).toBeVisible();

  const createdForm = await page.request.post("/api/admin/forms", {
    headers: { origin },
    data: {
      kind: "contact",
      templateId: "contact",
      title: "Website review contact",
    },
  });
  expect(createdForm.status()).toBe(201);
  const form = (await createdForm.json()) as FormDto;
  const formConsent = page.getByRole("checkbox", {
    name: `Publish form: ${form.draft.title}`,
    exact: true,
  });
  const formReview = dialog.getByRole("article").filter({ has: formConsent });
  const homeId = afterMenu.draft.homePageId!;
  const home = (await page.request
    .get(`/api/admin/cms/content/${homeId}?locale=en`)
    .then((response) => response.json())) as CmsDetail;
  const homeSaved = await page.request.post(
    `/api/admin/cms/content/${homeId}/save`,
    {
      headers: { origin },
      data: {
        locale: "en",
        expectedRevisionId: home.draft.id,
        title: home.draft.title,
        slug: home.draft.slug,
        description: home.draft.description,
        socialImageId: home.draft.socialImageId,
        data: {
          ...home.draft.data,
          content: [
            ...home.draft.data.content,
            {
              type: "Form",
              props: {
                id: "website-review-contact",
                version: 1,
                formId: form.id,
              },
            },
          ],
        },
      },
    },
  );
  expect(homeSaved.ok(), await homeSaved.text()).toBe(true);
  const assertPrivate = async () => {
    expect((await visitor.request.get(`/media/${asset.id}`)).status()).toBe(
      404,
    );
    expect((await visitor.request.get(`/api/forms/${form.id}`)).status()).toBe(
      404,
    );
    expect((await current()).published).toEqual(afterMenu.published);
    const detail = (await page.request
      .get(`/api/admin/cms/content/${homeId}?locale=en`)
      .then((response) => response.json())) as CmsDetail;
    expect(detail.publishedRevisionId).toBe(home.publishedRevisionId);
  };
  await trigger.click();
  await dialog.getByRole("radio", { name: /^Entire website/ }).check();
  await expect(formConsent).not.toBeChecked();
  await expect(
    formReview.getByRole("textbox", { name: /Your message/ }),
  ).toBeVisible();
  await imageConsent.check();
  await formConsent.check();
  await websiteConsent.check();
  await expect(publish).toBeEnabled();
  await dialog
    .frameLocator('iframe[title="Saved website preview"]')
    .getByRole("heading")
    .first()
    .click();
  await websiteConsent.focus();
  await expect(imageConsent).toBeChecked();
  await expect(formConsent).toBeChecked();
  await expect(websiteConsent).toBeChecked();
  await assertPrivate();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await assertPrivate();

  await trigger.click();
  await dialog.getByRole("radio", { name: /^Entire website/ }).check();
  await expect(imageConsent).not.toBeChecked();
  await expect(formConsent).not.toBeChecked();
  await imageConsent.check();
  await formConsent.check();
  await websiteConsent.check();
  // Another editor changes a reviewed dependency. The whole publication must fail.
  const changedDefinition = {
    ...form.draft,
    description:
      "The latest saved questions require a fresh publication review.",
  };
  const changedForm = await page.request.post(
    `/api/admin/forms/${form.id}/save`,
    {
      headers: { origin },
      data: {
        expectedRevision: form.draftRevision,
        definition: changedDefinition,
      },
    },
  );
  expect(changedForm.ok()).toBe(true);
  const latestForm = (await changedForm.json()) as FormDto;
  await publish.click();
  await expect(dialog).toBeVisible();
  await expect(websiteConsent).not.toBeChecked();
  await expect(imageConsent).not.toBeChecked();
  await expect(formConsent).not.toBeChecked();
  await assertPrivate();
  await dialog
    .getByRole("button", { name: "Check again", exact: true })
    .click();
  await expect(
    formReview.getByText(changedDefinition.description, { exact: true }),
  ).toBeVisible();
  await imageConsent.check();
  await formConsent.check();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await dialog.evaluate(
        (element) =>
          [element, ...element.querySelectorAll<HTMLElement>("*")].filter(
            (item) => {
              const style = getComputedStyle(item);
              return (
                ["auto", "scroll"].includes(style.overflowY) &&
                item.scrollHeight > item.clientHeight + 1
              );
            },
          ).length,
      ),
    ).toBeLessThanOrEqual(1);
    await dialog.locator(".website-publication-body").evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: `.local/website-publication-${width}.png`,
    });
  }
  await websiteConsent.check();
  await publish.click();
  await expect(dialog).toHaveCount(0);
  expect((await current()).published?.branding.iconId).toBe(asset.id);
  const publicForm = (await visitor.request
    .get(`/api/forms/${form.id}`)
    .then((response) => response.json())) as PublicFormDto;
  expect(publicForm.definition).toEqual(changedDefinition);
  await visitor.reload();
  await expect(
    visitor.locator(`link[rel="icon"][href="/media/${asset.id}"]`),
  ).toHaveCount(1);
  await expect(
    visitor.getByRole("textbox", { name: /Your message/ }).last(),
  ).toBeVisible();
  expect((await visitor.request.get(`/media/${asset.id}`)).status()).toBe(200);

  // Existing public forms keep their live questions unless individually selected.
  const optionalSave = await page.request.post(
    `/api/admin/forms/${form.id}/save`,
    {
      headers: { origin },
      data: {
        expectedRevision: latestForm.draftRevision,
        definition: {
          ...changedDefinition,
          description: "Optional unpublished form changes.",
        },
      },
    },
  );
  expect(optionalSave.ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await publishWebsite(page);
  const keptForm = (await visitor.request
    .get(`/api/forms/${form.id}`)
    .then((response) => response.json())) as PublicFormDto;
  expect(keptForm.versionId).toBe(publicForm.versionId);
  expect(keptForm.definition).toEqual(changedDefinition);
}
