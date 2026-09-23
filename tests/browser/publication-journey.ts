import { expect, type Page } from "@playwright/test";
import type { Pool } from "pg";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import type { PublicationScheduleDto } from "../../src/features/cms/publication_schemas";
import { runLocalTestJobs } from "./local-jobs";

export async function publicationJourney(
  page: Page,
  visitor: Page,
  database: Pool,
  origin: string,
) {
  const created = await page.request.post("/api/admin/cms/content", {
    headers: { origin },
    data: {
      kind: "page",
      locale: "en",
      title: "Planned club update",
      slug: "scheduled-browser-update",
    },
  });
  expect(created.status()).toBe(201);
  let content = (await created.json()) as CmsDetail;
  const base = `/api/admin/cms/content/${content.id}`;
  const saved = await page.request.post(`${base}/save`, {
    headers: { origin },
    data: {
      locale: "en",
      expectedRevisionId: content.draft.id,
      title: content.draft.title,
      slug: content.draft.slug,
      description: "",
      socialImageId: null,
      data: {
        root: { props: {} },
        content: [
          {
            type: "RichText",
            props: {
              id: "scheduled-text",
              version: 1,
              text: "<p>A club update published by the local runner.</p>",
            },
          },
        ],
      },
    },
  });
  expect(saved.status()).toBe(200);
  content = await saved.json();
  expect(
    (await visitor.request.get(`${base}/schedule?locale=en`)).status(),
  ).toBe(401);
  await page.goto(`/admin/website/${content.id}?locale=en`);
  await page.getByLabel("More page actions", { exact: true }).click();
  await page
    .getByRole("button", { name: "Scheduled publication", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Scheduled publication",
    exact: true,
  });
  const date = await page.evaluate(() => {
    const next = new Date(Date.now() + 600_000);
    return new Date(next.getTime() - next.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  });
  await dialog
    .getByLabel("Publication date and time", { exact: true })
    .fill(date);
  async function confirm() {
    const button = dialog.getByRole("button", {
      name: "Confirm publication schedule",
      exact: true,
    });
    await expect(button).toBeDisabled();
    await dialog
      .getByRole("checkbox", {
        name: "I confirm this publication schedule action.",
        exact: true,
      })
      .check();
    await button.click();
    await expect(
      dialog.getByRole("checkbox", {
        name: "I confirm this publication schedule action.",
        exact: true,
      }),
    ).toHaveCount(0);
  }
  await dialog
    .getByRole("button", { name: "Review publication schedule", exact: true })
    .click();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await dialog.screenshot({
      path: `.local/publication-review-${device}.png`,
    });
  }
  await confirm();
  await expect(dialog.getByText("Scheduled", { exact: true })).toBeVisible();
  expect(
    (await visitor.request.get("/pages/en/scheduled-browser-update")).status(),
  ).toBe(404);
  await dialog
    .getByRole("button", { name: "Review cancelling schedule", exact: true })
    .click();
  await confirm();
  await expect(dialog.getByText("Cancelled", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Review publication schedule", exact: true })
    .click();
  await confirm();
  const response = await page.request.get(`${base}/schedule?locale=en`);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const state = (await response.json()) as PublicationScheduleDto;
  expect(state.activeId).not.toBeNull();
  expect(JSON.stringify(state)).not.toMatch(/sessionId|leaseToken|requestedBy/);
  expect(
    (
      await page.request.post(`${base}/cancel-schedule`, {
        headers: { origin: "https://untrusted.example" },
        data: { locale: "en", jobId: state.activeId, confirmed: true },
      })
    ).status(),
  ).toBe(403);
  // Accelerate only this explicit synthetic job in the already guarded disposable DB.
  const accelerated = await database.query(
    "UPDATE club.cms_publication_job SET due_at=now()-interval '1 minute', available_at=now()-interval '1 minute' WHERE id=$1",
    [state.activeId],
  );
  expect(accelerated.rowCount).toBe(1);
  await dialog
    .getByRole("button", { name: "Refresh publication status", exact: true })
    .click();
  await expect(
    dialog.getByText("Delayed — waiting for the runner", { exact: true }),
  ).toBeVisible();
  expect(
    (await runLocalTestJobs(origin)).find(
      (r) => r.event === "cms_publications_processed",
    )?.published,
  ).toBe(1);
  // A separate invocation proves durable completion and safe process restart/replay.
  expect(
    (await runLocalTestJobs(origin)).find(
      (r) => r.event === "cms_publications_processed",
    )?.processed,
  ).toBe(0);
  await visitor.goto("/pages/en/scheduled-browser-update");
  await expect(
    visitor.getByText("A club update published by the local runner.", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Refresh publication status", exact: true })
    .click();
  await expect(dialog.getByText("Published", { exact: true })).toBeVisible();
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await dialog.screenshot({
      path: `.local/publication-status-${device}.png`,
    });
  }
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Publish saved draft", exact: true }),
  ).toBeDisabled();
}
