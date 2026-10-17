import { expect, type Page } from "@playwright/test";

/** Capture actual template renderers for visual review and catalogue thumbnails. */
export async function captureKitPreviews(page: Page) {
  for (const template of ["rotary-service", "rotaract-action"]) {
    for (const recipe of ["home", "contact", "gallery"]) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 1000 : 844,
        });
        await page.goto(
          `/admin/website/preview?template=${template}&locale=en&recipe=${recipe}`,
        );
        const content = page.locator(".cms-public");
        await expect(content).toBeVisible();
        await expect(
          page.getByRole("heading", {
            name: "Preview unavailable",
            exact: true,
          }),
        ).toHaveCount(0);
        await content.locator("img").evaluateAll(async (images) => {
          await Promise.all(
            images.map((image) =>
              image instanceof HTMLImageElement &&
              image.getBoundingClientRect().top < innerHeight &&
              image.getBoundingClientRect().bottom > 0
                ? image.decode().catch(() => undefined)
                : undefined,
            ),
          );
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        if (recipe === "contact")
          await expect(
            page.getByRole("button", { name: "Send message", exact: true }),
          ).toBeDisabled();
        await page.screenshot({
          path: `.local/template-${template}-${recipe}-${width}.png`,
        });
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
