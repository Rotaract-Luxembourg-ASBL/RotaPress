import { expect, type Page } from "@playwright/test";
import type { SiteDraft } from "../../src/features/cms/cms_schemas";
import type { FormDto } from "../../src/features/forms/form_types";
import {
  publishWebsite,
  saveWebsiteSettings,
} from "./website-workspace-journey";

/** Shared branding extends B02 after its complete-template setup. */
export async function brandingJourney(
  page: Page,
  visitor: Page,
  assetId: string,
) {
  const forms = (await page.request
    .get("/api/admin/forms")
    .then((response) => response.json())) as { forms: FormDto[] };
  const contact = forms.forms.find(
    (form) => !form.event && form.kind === "contact" && form.publishedVersionId,
  );
  expect(contact).toBeTruthy();
  const current = async () =>
    (await page.request
      .get("/api/admin/cms/site?locale=en")
      .then((response) => response.json())) as SiteDraft;
  const before = await current();
  const logoAlt = "Synthetic shared club logo";
  const paths = ["/", `/forms/${contact!.id}`, "/sign-in", "/membership"];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/website?tab=appearance");
  await expect(
    page.getByRole("heading", { name: "Branding & appearance", exact: true }),
  ).toBeVisible();
  const picker = page.getByRole("dialog", {
    name: "Choose an image",
    exact: true,
  });
  await page
    .getByRole("button", { name: "Choose club logo", exact: true })
    .click();
  await picker
    .getByRole("searchbox", { name: "Search media" })
    .fill("Synthetic club image");
  await picker.getByRole("button", { name: /Synthetic club image/ }).click();
  await picker
    .getByRole("button", { name: "Insert image", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Logo alternative text", exact: true })
    .fill(logoAlt);
  await page
    .getByRole("button", { name: "Choose browser icon", exact: true })
    .click();
  await picker
    .getByRole("searchbox", { name: "Search media" })
    .fill("Synthetic club image");
  await picker.getByRole("button", { name: /Synthetic club image/ }).click();
  await picker
    .getByRole("button", { name: "Insert image", exact: true })
    .click();
  await page.getByRole("tab", { name: "Colors & type", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Custom accent color", exact: true })
    .check();
  await page.getByLabel("Accent color", { exact: true }).fill("#365a69");
  await page
    .getByRole("combobox", { name: "Heading style", exact: true })
    .selectOption("serif");
  const identityTab = page.getByRole("tab", {
    name: "Logo & icon",
    exact: true,
  });
  await identityTab.click();
  await expect(
    page.getByRole("textbox", { name: "Logo alternative text", exact: true }),
  ).toHaveValue(logoAlt);
  await identityTab.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Colors & type", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Accent color", { exact: true })).toHaveValue(
    "#365a69",
  );
  await expect(
    page.getByRole("button", { name: "Publish website", exact: true }),
  ).toBeDisabled();
  await saveWebsiteSettings(page);
  const saved = await current();
  expect(saved.draft.branding).toMatchObject({
    logoId: assetId,
    logoAlt,
    iconId: assetId,
  });
  expect(saved.published).toEqual(before.published);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Logo alternative text", exact: true }),
  ).toHaveValue(logoAlt);
  await expect(
    page.getByText("Saved draft · Not published yet", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Colors & type", exact: true }).click();
  const hex = page.getByRole("textbox", { name: "Hex color", exact: true });
  await hex.fill("#bad");
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish website", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save settings", exact: true }),
  ).toBeEnabled();
  await hex.fill("#365a69");
  await expect(
    page.getByRole("button", { name: "Save settings", exact: true }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "Logo & icon", exact: true }).click();
  await page.screenshot({
    path: ".local/branding-settings-desktop.png",
    fullPage: true,
    mask: [page.locator(".admin-account")],
  });
  await expect(
    page
      .locator(".admin-topbar")
      .getByRole("img", { name: logoAlt, exact: true }),
  ).toHaveCount(0);
  for (const path of paths) {
    await visitor.goto(path);
    await expect(
      visitor.getByRole("img", { name: logoAlt, exact: true }),
    ).toHaveCount(0);
  }
  const previewPromise = page.waitForEvent("popup");
  await page
    .getByRole("link", { name: "Preview website", exact: true })
    .click();
  const preview = await previewPromise;
  await expect(
    preview.locator("header").getByRole("img", { name: logoAlt, exact: true }),
  ).toBeVisible();
  await preview.close();
  await publishWebsite(page);
  await expect(
    page
      .locator(".admin-topbar")
      .getByRole("img", { name: logoAlt, exact: true }),
  ).toBeVisible();
  for (const path of paths) {
    for (const width of [1440, 390]) {
      await visitor.setViewportSize({ width, height: 1000 });
      await visitor.goto(path);
      const logo = visitor
        .locator(path === "/sign-in" ? ".auth-shell-brand" : "header")
        .getByRole("img", { name: logoAlt, exact: true });
      await expect(logo).toBeVisible();
      await expect(logo).toHaveAttribute("src", `/media/${assetId}`);
      if (path === "/sign-in") {
        await expect(visitor.locator(".cms-public")).toHaveCount(0);
        await expect(visitor.locator(".auth-shell")).toBeVisible();
        expect(
          await visitor
            .locator("h1")
            .evaluate((heading) => getComputedStyle(heading).fontFamily),
        ).not.toContain("Georgia");
      } else {
        await expect(visitor.locator(".cms-public")).toHaveAttribute(
          "data-theme",
          "rotary-service",
        );
        expect(
          await visitor
            .locator(".cms-public")
            .evaluate((root) =>
              getComputedStyle(root).getPropertyValue("--club-accent"),
            ),
        ).toBe("#365a69");
        expect(
          await visitor
            .locator("h1")
            .first()
            .evaluate((heading) => getComputedStyle(heading).fontFamily),
        ).toContain("Georgia");
      }
      await expect(
        visitor.locator(`link[rel="icon"][href="/media/${assetId}"]`),
      ).toHaveCount(1);
      expect(
        await visitor.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (path === "/sign-in") {
        await expect(
          visitor.getByLabel("Email address", { exact: true }),
        ).toBeVisible();
        await expect(
          visitor.getByLabel("Your name", { exact: true }),
        ).toHaveCount(0);
      }
      if (path.startsWith("/forms/")) {
        await expect(
          visitor.getByRole("heading", {
            name: contact!.draft.title,
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          visitor.getByRole("button", { name: "Send message", exact: true }),
        ).toBeVisible();
      }
      if (path === "/membership") {
        await expect(
          visitor.getByRole("heading", {
            name: "Your club, closer.",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          visitor.getByRole("link", {
            name: "Sign in to continue",
            exact: true,
          }),
        ).toBeVisible();
      }
      await visitor.screenshot({
        path: `.local/branding-${path === "/" ? "website" : path === "/sign-in" ? "sign-in" : path === "/membership" ? "membership" : "form"}-${width}.png`,
        fullPage: false,
      });
    }
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: ".local/branding-settings-phone.png",
    fullPage: true,
    mask: [page.locator(".admin-account")],
  });
  const memberPortal = await page.context().newPage();
  await memberPortal.goto("/membership");
  const portal = memberPortal.locator(".cms-public .member-portal");
  await expect(
    memberPortal
      .locator(".cms-public > header")
      .getByRole("img", { name: logoAlt, exact: true }),
  ).toBeVisible();
  await expect(portal).toBeVisible();
  await expect(memberPortal.locator(".cms-public")).toHaveAttribute(
    "data-theme",
    "rotary-service",
  );
  expect(
    await portal.evaluate((root) =>
      getComputedStyle(root).getPropertyValue("--club-accent"),
    ),
  ).toBe("#365a69");
  expect(
    await portal
      .locator("h1")
      .evaluate((heading) => getComputedStyle(heading).fontFamily),
  ).toContain("Georgia");
  await expect(
    portal.getByRole("link", { name: "Explore events", exact: true }),
  ).toHaveCSS("background-color", "rgb(54, 90, 105)");
  for (const width of [1440, 390, 320]) {
    await memberPortal.setViewportSize({ width, height: 1000 });
    expect(
      await memberPortal.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width < 1440) {
      const menu = memberPortal.getByRole("button", {
        name: "Open member menu",
        exact: true,
      });
      await menu.click();
      const dialog = memberPortal.getByRole("dialog", {
        name: "Member menu",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate((root) =>
          getComputedStyle(root).getPropertyValue("--club-accent"),
        ),
      ).toBe("#365a69");
      await memberPortal.keyboard.press("Escape");
      await expect(menu).toBeFocused();
    }
    await memberPortal.screenshot({
      path: `.local/branding-member-portal-${width}.png`,
      fullPage: true,
      mask: [memberPortal.locator("[data-private]")],
    });
  }
  await memberPortal.setViewportSize({ width: 1440, height: 1000 });
  await memberPortal.goto("/membership?tab=profile");
  await memberPortal
    .getByLabel("Display name", { exact: true })
    .fill("Unsaved native navigation");
  const nativeLink = memberPortal
    .locator(".site-menu-wide a[href^='/']")
    .first();
  await expect(nativeLink).toBeVisible();
  const destination = await nativeLink.getAttribute("href");
  const leaveDialogs: string[] = [];
  const acceptLeave = async (dialog: import("@playwright/test").Dialog) => {
    leaveDialogs.push(dialog.type());
    await dialog.accept();
  };
  memberPortal.on("dialog", acceptLeave);
  await nativeLink.click();
  await expect(memberPortal).toHaveURL(
    new URL(destination!, memberPortal.url()).href,
  );
  memberPortal.off("dialog", acceptLeave);
  expect(leaveDialogs).toEqual(["confirm"]);
  await memberPortal.goto("/membership?tab=profile");
  await expect(
    memberPortal.getByLabel("Display name", { exact: true }),
  ).not.toHaveValue("Unsaved native navigation");
  await memberPortal.close();
  await expect(page.locator(".admin-layout")).toBeVisible();
  await expect(page.locator(".cms-public")).toHaveCount(0);
  expect(
    await page
      .locator(".admin-layout")
      .evaluate((root) =>
        getComputedStyle(root).getPropertyValue("--club-accent"),
      ),
  ).not.toBe("#365a69");
  expect(
    await page
      .locator(".admin-layout h1")
      .evaluate((heading) => getComputedStyle(heading).fontFamily),
  ).not.toContain("Georgia");
}
