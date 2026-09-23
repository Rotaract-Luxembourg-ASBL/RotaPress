import { expect, type Page } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import type { EventDraft } from "../../src/features/events/event_schemas";
import { communityContent } from "../fixtures/community-content";

/** Continues B02 with its real owner session and existing public image. */
export async function communityJourney(
  page: Page,
  visitor: Page,
  origin: string,
  assetId: string,
) {
  async function mutate<T>(path: string, data: unknown): Promise<T> {
    const response = await page.request.post(path, {
      headers: { origin },
      data,
    });
    expect(response.ok(), `${path} returned ${response.status()}`).toBe(true);
    return response.json() as Promise<T>;
  }
  const action = (entry: CmsDetail) => ({
    locale: "en",
    expectedRevisionId: entry.draft.id,
  });
  async function save(entry: CmsDetail, data = communityContent(assetId)) {
    return mutate<CmsDetail>(`/api/admin/cms/content/${entry.id}/save`, {
      ...action(entry),
      title: entry.draft.title,
      slug: entry.draft.slug,
      description: "Synthetic local component acceptance",
      socialImageId: assetId,
      data,
    });
  }
  expect(
    (await visitor.request.get("/api/admin/events/catalogue")).status(),
  ).toBe(401);
  let cms = await mutate<CmsDetail>("/api/admin/cms/content", {
    kind: "page",
    locale: "en",
    title: "Community showcase",
    slug: "community-showcase",
    templateId: "community",
  });
  cms = await save(cms);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/admin/website/${cms.id}?locale=en`);
  await expect(
    page.locator(".editor-canvas .cms-feature-section"),
  ).toBeVisible();
  await page.locator(".editor-canvas .cms-feature-section h2").click();
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Section background", exact: true })
    .selectOption("soft");
  await page
    .getByRole("combobox", { name: "Section spacing", exact: true })
    .selectOption("comfortable");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await visitor.request.get("/pages/en/community-showcase")).status(),
  ).toBe(404);
  const previewPromise = page.waitForEvent("popup");
  await page.getByLabel(/More .* actions/).click();
  await page.getByRole("link", { name: /Preview saved draft/ }).click();
  const preview = await previewPromise;
  await expect(
    preview.getByRole("heading", {
      name: "Good people. Shared purpose.",
      exact: true,
    }),
  ).toBeVisible();
  await visitor.goto(preview.url());
  await expect(visitor).toHaveURL(/\/sign-in/);
  await preview.close();
  await page
    .getByRole("button", { name: "Mobile canvas width", exact: true })
    .click();
  await page
    .locator(".editor-canvas .cms-feature-section")
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/community-editor-mobile-preview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByText("Published. The website now shows this saved revision.", {
      exact: true,
    }),
  ).toBeVisible();
  await visitor.goto("/pages/en/community-showcase");
  const carousel = visitor.getByRole("region", {
    name: "Community stories",
    exact: true,
  });
  await carousel.getByRole("button", { name: "Next featured story" }).click();
  await expect(
    carousel.getByRole("heading", { name: "Small actions. Shared impact." }),
  ).toBeVisible();
  await carousel
    .getByRole("button", { name: "Previous featured story" })
    .click();

  const managers = (await page.request
    .get("/api/admin/events/managers")
    .then((r) => r.json())) as {
    managers: { userId: string; isCurrent: boolean }[];
  };
  const manager = managers.managers.find((item) => item.isCurrent)!;
  let event = await mutate<EventDraft>("/api/admin/events", {
    title: "Synthetic community evening",
    description:
      "A local fixture demonstrating a dedicated event page and automatic public listings.",
    startsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    endsAt: null,
    timezone: "Europe/Luxembourg",
    venue: "Synthetic community venue",
    visibility: "public",
    managerUserId: manager.userId,
  });
  event = await mutate<EventDraft>(`/api/admin/events/${event.id}/modules`, {
    expectedVersion: event.version,
    key: "website",
    operation: "enable",
    confirmed: true,
  });
  let landing = await mutate<CmsDetail>("/api/admin/cms/content", {
    kind: "page",
    locale: "en",
    title: "Community evening",
    slug: "website",
    event: { id: event.id, moduleKey: "website" },
  });
  const eventContent = communityContent(assetId);
  eventContent.content = eventContent.content.filter((item) =>
    ["HeroSlider", "Programme", "ParticipationOptions", "FAQ"].includes(
      item.type,
    ),
  );
  landing = await save(landing, eventContent);
  await mutate(`/api/admin/cms/content/${landing.id}/publish`, action(landing));
  await visitor.reload();
  await expect(
    visitor
      .locator(".cms-event-collection")
      .getByText(event.title, { exact: true }),
  ).toHaveCount(0);
  expect(
    (await visitor.request.get(`/events/${event.id}/en/website`)).status(),
  ).toBe(404);
  await mutate(`/api/admin/events/${event.id}/publication`, {
    expectedVersion: event.version,
    operation: "publish",
    confirmed: true,
  });
  await visitor.reload();
  await expect(
    visitor
      .locator(".cms-event-collection")
      .getByRole("heading", { name: event.title, exact: true }),
  ).toBeVisible();
  const catalogue = await page.request.get(
    "/api/admin/events/catalogue?period=all",
  );
  expect(catalogue.headers()["cache-control"]).toContain("no-store");

  for (const [device, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
  ] as const) {
    await visitor.setViewportSize({ width, height });
    for (const [name, url, heading] of [
      ["community", "/pages/en/community-showcase", "A place to belong"],
      ["event-directory", "/events", "Club events"],
      [
        "event-landing",
        `/events/${event.id}/en/website`,
        "Our evening together",
      ],
    ]) {
      await visitor.goto(url);
      await expect(
        visitor.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await visitor.evaluate(() => {
        // Full-page captures need off-screen images loaded as well.
        document.querySelectorAll("img").forEach((img) => {
          img.loading = "eager";
        });
      });
      await expect
        .poll(() =>
          visitor.evaluate(() =>
            Array.from(document.images).every(
              (img) => img.complete && img.naturalWidth > 0,
            ),
          ),
        )
        .toBe(true);
      expect(
        await visitor.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${name} ${device} fits`,
      ).toBe(true);
      await visitor.screenshot({
        path: `.local/${name}-${device}.png`,
        fullPage: true,
      });
    }
  }
  await visitor.goto("/events?period=past");
  await expect(
    visitor.getByRole("heading", { name: event.title, exact: true }),
  ).toHaveCount(0);
  await visitor
    .getByRole("link", { name: "Upcoming & ongoing", exact: true })
    .click();
  await expect(
    visitor.getByRole("heading", { name: event.title, exact: true }),
  ).toBeVisible();

  await page.goto("/admin/website?tab=menus");
  const settings = (await page.request
    .get("/api/admin/cms/site?locale=en")
    .then((r) => r.json())) as { version: number; draft: object };
  const saved = await mutate<{ version: number }>("/api/admin/cms/site", {
    locale: "en",
    expectedVersion: settings.version,
    settings: {
      ...settings.draft,
      navigation: [{ systemPage: "events", label: "Event diary" }],
    },
  });
  await mutate("/api/admin/cms/site/publish", {
    locale: "en",
    expectedVersion: saved.version,
  });
  await visitor.goto("/pages/en/community-showcase");
  await visitor.locator("header summary").click();
  await visitor
    .locator("header")
    .getByRole("link", { name: "Event diary", exact: true })
    .click();
  await expect(visitor).toHaveURL(/\/events\?locale=en$/);
}
