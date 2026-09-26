import type { Page } from "@playwright/test";

/** Synthetic assistant page is intercepted in-process; no external host is contacted. */
export async function openOAuthFromAssistant(page: Page, authorizeUrl: string) {
  const assistant = "https://oauth-client.example.test/connect";
  await page.route(assistant, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<a href="${authorizeUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">Connect to RotaPress</a>`,
    }),
  );
  try {
    await page.goto(assistant);
    await page.getByRole("link", { name: "Connect to RotaPress" }).click();
  } finally {
    await page.unroute(assistant);
  }
}
