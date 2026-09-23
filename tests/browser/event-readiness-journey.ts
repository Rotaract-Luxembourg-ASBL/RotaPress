import { expect, type Page } from "@playwright/test";
import type { EventReadiness } from "../../src/features/events/event_readiness";

/** B01 keeps the existing page and checks saved visibility against actual guests. */
export async function eventReadinessJourney(
  manager: Page,
  visitor: Page,
  eventId: string,
  pageId: string,
) {
  const editorHref = `/admin/events/${eventId}/page/${pageId}?locale=en`;
  const publicHref = `/events/${eventId}/en/website`;
  const readiness = async () => {
    const response = await manager.request.get(
      `/api/admin/events/${eventId}/readiness`,
    );
    expect(response.ok()).toBe(true);
    return (await response.json()) as EventReadiness;
  };
  const checkPlacement = async (draft: boolean, published: boolean) => {
    const data = await readiness();
    expect(data.registration.placement).toMatchObject({
      draft,
      published,
      live: published,
    });
    await manager.goto(`/admin/events/${eventId}?tab=participation`);
    const placement = manager.getByRole("region", {
      name: "Registration page placement",
      exact: true,
    });
    await expect(
      placement.getByText(`Saved draft: ${draft ? "Visible" : "Not visible"}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      placement.getByText(
        `Published page: ${published ? "Visible" : "Not visible"}`,
        {
          exact: true,
        },
      ),
    ).toBeVisible();
  };
  const saveVisibility = async (visible: boolean) => {
    await manager.goto(editorHref);
    await manager
      .getByRole("button", { name: "Page layout", exact: true })
      .click();
    await manager
      .getByRole("checkbox", { name: "Show Event registration", exact: true })
      .setChecked(visible);
    await manager
      .getByRole("button", { name: "Save draft", exact: true })
      .click();
    await expect(
      manager.getByText("Draft saved. Your public page has not changed.", {
        exact: true,
      }),
    ).toBeVisible();
  };
  const publish = async () => {
    await manager.goto(editorHref);
    await Promise.all([
      manager.waitForEvent("dialog").then((dialog) => dialog.accept()),
      manager
        .getByRole("button", { name: "Publish changes", exact: true })
        .click(),
    ]);
    await expect(
      manager.getByText("Published. Guests now see this event and page.", {
        exact: true,
      }),
    ).toBeVisible();
  };

  await checkPlacement(true, true);
  await saveVisibility(false);
  await checkPlacement(false, true);
  await manager.screenshot({
    path: ".local/event-readiness-draft-and-live.png",
  });
  await visitor.goto(publicHref);
  await expect(
    visitor.getByRole("region", { name: "Event registration", exact: true }),
  ).toBeVisible();

  await publish();
  await checkPlacement(false, false);
  await visitor.reload();
  await expect(
    visitor.getByRole("region", { name: "Event registration", exact: true }),
  ).toHaveCount(0);

  await saveVisibility(true);
  await checkPlacement(true, false);
  await publish();
  await checkPlacement(true, true);
  await visitor.reload();
  await expect(
    visitor.getByRole("region", { name: "Event registration", exact: true }),
  ).toBeVisible();
}
