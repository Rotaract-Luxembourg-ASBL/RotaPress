import { expect, type Page } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import {
  customCodeSecurityProbe,
  interceptCustomCodeProbe,
} from "./custom-code-security";

/** B02: real owner edits, publication, dynamic identity and an opaque JavaScript frame. */
export async function clubContentJourney(owner: Page, visitor: Page) {
  await owner.goto("/admin/settings");
  await owner.getByLabel("District number", { exact: true }).fill("2160");
  await owner.getByLabel("City", { exact: true }).fill("Example town");
  await owner.getByLabel("Country", { exact: true }).fill("Luxembourg");
  await owner
    .getByText("Contact, meetings and club links", { exact: true })
    .click();
  await owner
    .getByLabel("Polaris link", { exact: true })
    .fill("https://portal.example.test/club");
  await owner
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    owner.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await owner.reload();
  await expect(
    owner.getByLabel("District number", { exact: true }),
  ).toHaveValue("2160");
  for (const width of [1440, 390]) {
    await owner.setViewportSize({ width, height: 960 });
    expect(
      await owner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await owner.screenshot({
      path: `.local/feedback-captures/club-settings-${width}.png`,
      fullPage: true,
      mask: [owner.locator(".admin-account")],
    });
  }
  await owner
    .getByRole("button", { name: "Sign-in & security", exact: true })
    .click();
  await owner.getByLabel("Google button color").selectOption("dark");
  await owner.getByLabel("Google button shape").selectOption("pill");
  await owner
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    owner.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const loginSettings = await owner.request
    .get("/api/admin/settings")
    .then((response) => response.json());
  expect(loginSettings.staffLogin).toMatchObject({
    buttonTheme: "dark",
    buttonShape: "pill",
  });
  await expect(
    owner.locator(".staff-login-preview .google-sign-in"),
  ).toHaveClass(/google-theme-dark google-shape-pill/);
  const post = async (path: string, data: unknown) => {
    const response = await owner.request.post(path, {
      headers: { origin: smokeOrigin },
      data,
    });
    expect(
      response.ok(),
      `CMS operation ${path}: HTTP ${response.status()}`,
    ).toBe(true);
    return response.json();
  };
  let page = (await post("/api/admin/cms/content", {
    kind: "page",
    locale: "en",
    title: "Club information",
    slug: "club-information",
  })) as CmsDetail;
  page = (await post(`/api/admin/cms/content/${page.id}/save`, {
    locale: "en",
    expectedRevisionId: page.draft.id,
    title: "Club information",
    slug: "club-information",
    description: "Public club information",
    socialImageId: null,
    data: {
      root: { props: {} },
      content: [
        {
          type: "ClubDetails",
          props: {
            id: "details",
            version: 1,
            title: "Club details",
            fields: [
              { field: "districtNumber" },
              { field: "city" },
              { field: "country" },
              { field: "polarisUrl" },
            ],
            layout: "columns",
            showLabels: true,
          },
        },
        {
          type: "CustomCode",
          props: {
            id: "custom",
            version: 1,
            title: "Counter widget",
            html: '<button id="counter">Count: 0</button><p id="isolation"></p>',
            css: "button{padding:12px}",
            javascript:
              'let count=0;document.getElementById("counter").onclick=()=>document.getElementById("counter").textContent="Count: "+(++count);try{parent.document.body.dataset.compromised="yes"}catch{document.getElementById("isolation").textContent="Parent access blocked"}' +
              customCodeSecurityProbe,
            height: 180,
          },
        },
      ],
    },
  })) as CmsDetail;
  expect(
    (await visitor.request.get("/pages/en/club-information")).status(),
  ).toBe(404);
  await owner.goto(`/admin/website/${page.id}?locale=en`);
  await expect(owner.locator(".seo-search-preview")).toContainText(
    "Club information |",
  );
  await expect(
    owner.getByRole("button", { name: "Run code preview", exact: true }),
  ).toBeVisible();
  await expect(owner.locator("iframe.cms-custom-code")).toHaveCount(0);
  const ownerProbe = await interceptCustomCodeProbe(owner);
  // The editing canvas intercepts block clicks for selection. Execute the same
  // sandbox in the authenticated saved-draft preview, before publication.
  await owner.goto(`/admin/website/${page.id}/preview?locale=en`);
  await expect(owner.locator("iframe.cms-custom-code")).toHaveCount(0);
  await owner
    .getByRole("button", { name: "Run code preview", exact: true })
    .click();
  await ownerProbe.check();
  await owner
    .getByRole("button", { name: "Stop code preview", exact: true })
    .click();
  await expect(owner.locator("iframe.cms-custom-code")).toHaveCount(0);
  await ownerProbe.dispose();
  await post(`/api/admin/cms/content/${page.id}/publish`, {
    locale: "en",
    expectedRevisionId: page.draft.id,
  });
  const visitorProbe = await interceptCustomCodeProbe(visitor);
  for (const width of [1440, 390]) {
    await visitor.setViewportSize({ width, height: 960 });
    await visitor.goto("/pages/en/club-information");
    await expect(visitor).toHaveTitle(/Club information \|/);
    await expect(visitor.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      await visitor.title(),
    );
    await expect(
      visitor.getByText("Example town", { exact: true }),
    ).toBeVisible();
    await expect(
      visitor.getByRole("link", { name: "Polaris link", exact: true }),
    ).toHaveAttribute("href", "https://portal.example.test/club");
    const frame = visitor.frameLocator('iframe[title="Counter widget"]');
    await expect(frame.getByText("Parent access blocked")).toBeVisible();
    await visitorProbe.check();
    await frame.getByRole("button", { name: "Count: 0" }).click();
    await expect(frame.getByRole("button", { name: "Count: 1" })).toBeVisible();
    expect(
      await visitor.locator("body").getAttribute("data-compromised"),
    ).toBeNull();
    expect(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await visitor.screenshot({
      path: `.local/feedback-captures/custom-content-${width}.png`,
      fullPage: true,
    });
  }
  await visitorProbe.dispose();
  const settings = await owner.request
    .get("/api/admin/settings")
    .then((response) => response.json());
  const saved = await owner.request.patch("/api/admin/settings", {
    headers: { origin: smokeOrigin },
    data: {
      ...settings,
      profile: { ...settings.profile, city: "Updated town" },
    },
  });
  expect(saved.ok()).toBe(true);
  await visitor.reload();
  await expect(
    visitor.getByText("Updated town", { exact: true }),
  ).toBeVisible();
  await owner.setViewportSize({ width: 1440, height: 1000 });
}
