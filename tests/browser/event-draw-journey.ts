import { expect, type Page } from "@playwright/test";
import type { DrawWorkspace } from "../../src/features/events/draw_schemas";

/** B01 extends the existing real staff session and reviewed synthetic purchase entries. */
export async function eventDrawJourney(
  manager: Page,
  visitor: Page,
  eventId: string,
) {
  const endpoint = `/api/admin/events/${eventId}/draws`;
  const origin = new URL(manager.url()).origin;
  expect((await visitor.request.get(endpoint)).status()).toBe(401);
  await manager.goto(`/admin/events/${eventId}?tab=prizes`);
  await manager
    .getByRole("tab", { name: "Prize gallery", exact: true })
    .click();
  const prize = manager.getByRole("region", {
    name: "Prize editor",
    exact: true,
  });
  await prize
    .getByRole("textbox", { name: "Prize title", exact: true })
    .fill("Synthetic demonstration prize");
  await prize
    .getByRole("textbox", { name: "Prize description", exact: true })
    .fill("A practice prize with no real award.");
  await prize
    .getByRole("spinbutton", { name: "Quantity", exact: true })
    .fill("1");
  await prize
    .getByRole("button", { name: "Create prize draft", exact: true })
    .click();
  await expect(
    manager.getByText(
      "Prize draft saved. The published gallery has not changed.",
      { exact: true },
    ),
  ).toBeVisible();
  manager.once("dialog", (dialog) => dialog.accept());
  await prize
    .getByRole("button", { name: "Publish prize", exact: true })
    .click();
  await expect(
    manager.getByText("Prize published.", { exact: true }),
  ).toBeVisible();
  await manager
    .getByRole("tab", { name: "Prize gallery", exact: true })
    .focus();
  await manager.keyboard.press("End");
  await expect(
    manager.getByRole("tab", { name: "Draws & winners", exact: true }),
  ).toBeFocused();
  const panel = manager.getByRole("region", {
    name: "Draws and winners",
    exact: true,
  });
  await expect(
    panel.getByText("Your first demonstration draw", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Prepare a draw", exact: true })
    .click();
  const prepare = manager.getByRole("dialog", {
    name: "Prepare a demonstration draw",
    exact: true,
  });
  await manager.keyboard.press("Escape");
  await expect(
    panel.getByRole("button", { name: "Prepare a draw", exact: true }),
  ).toBeFocused();
  await panel
    .getByRole("button", { name: "Prepare a draw", exact: true })
    .click();
  await prepare
    .getByRole("textbox", { name: "Draw name", exact: true })
    .fill("Synthetic browser draw");
  await prepare
    .getByRole("textbox", {
      name: "Purpose and demonstration rules",
      exact: true,
    })
    .fill("Rehearse the local draw and approved public names.");
  await prepare.getByRole("button", { name: "Continue", exact: true }).click();
  await prepare
    .getByRole("spinbutton", {
      name: "Quantity for Synthetic demonstration prize",
      exact: true,
    })
    .fill("1");
  await prepare.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    prepare.getByText("7 entries from 1 participant", { exact: true }),
  ).toBeVisible();
  await prepare
    .getByRole("checkbox", {
      name: "I reviewed this demonstration pool and its rules.",
      exact: true,
    })
    .check();
  await manager.setViewportSize({ width: 390, height: 900 });
  expect(await prepare.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await prepare.screenshot({ path: ".local/event-draw-freeze-phone.png" });
  await prepare
    .getByRole("button", { name: "Freeze reviewed draw", exact: true })
    .click();
  await expect(prepare).toHaveCount(0);
  await manager.reload();
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", {
      name: "Open draw Synthetic browser draw",
      exact: true,
    })
    .click();
  await panel
    .getByRole("button", { name: "Review & run draw", exact: true })
    .click();
  const run = manager.getByRole("dialog", {
    name: "Run the demonstration draw",
    exact: true,
  });
  await run
    .getByRole("checkbox", {
      name: "I reviewed this demonstration decision.",
      exact: true,
    })
    .check();
  await run
    .getByRole("button", { name: "Run demonstration", exact: true })
    .click();
  await expect(run).toHaveCount(0);
  await expect(
    panel.getByRole("region", { name: "Private draw results", exact: true }),
  ).toBeVisible();
  const workspace = (await manager.request
    .get(endpoint)
    .then((response) => response.json())) as DrawWorkspace;
  const draw = workspace.items[0];
  const replay = await manager.request.post(`${endpoint}/${draw.id}/run`, {
    headers: { origin },
    data: { mode: "demo", expectedDigest: draw.digest, confirmed: true },
  });
  expect(replay.ok()).toBe(true);
  expect((await replay.json()).result).toEqual(draw.result);
  const foreign = await manager.request.post(`${endpoint}/${draw.id}/run`, {
    headers: { origin: "https://untrusted.example.test" },
    data: { mode: "demo", expectedDigest: draw.digest, confirmed: true },
  });
  expect(foreign.status()).toBe(403);
  await manager.setViewportSize({ width: 1440, height: 1000 });
  await panel.screenshot({ path: ".local/event-draw-result-desktop.png" });
  await panel
    .getByRole("button", { name: "Review names for publication", exact: true })
    .click();
  const publication = manager.getByRole("dialog", {
    name: "Review public winner names",
    exact: true,
  });
  await expect(
    publication.getByRole("textbox", {
      name: "Public name for winner 1",
      exact: true,
    }),
  ).toHaveValue("");
  await publication
    .getByRole("textbox", { name: "Public name for winner 1", exact: true })
    .fill("Demo winner A");
  await publication
    .getByRole("textbox", { name: "Reason for this decision", exact: true })
    .fill("Only this synthetic public alias is approved.");
  await publication
    .getByRole("checkbox", {
      name: "I approve exactly the public names shown above.",
      exact: true,
    })
    .check();
  await publication.screenshot({
    path: ".local/event-draw-publication-desktop.png",
  });
  await publication
    .getByRole("button", { name: "Publish approved names", exact: true })
    .click();
  await expect(publication).toHaveCount(0);
  await expect(
    panel.getByText("Approved names saved for the event website.", {
      exact: true,
    }),
  ).toBeVisible();
  // A published result is placed deliberately using the same page designer and publication boundary.
  await manager
    .getByRole("button", { name: "Event page", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Add section", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Add Demonstration winners", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(
    manager.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  await visitor.goto(`/events/${eventId}/en/website`);
  await expect(
    visitor.getByRole("region", {
      name: "Published demonstration winners",
      exact: true,
    }),
  ).toHaveCount(0);
  manager.once("dialog", (dialog) => dialog.accept());
  await manager
    .getByRole("button", { name: "Publish changes", exact: true })
    .click();
  await expect(
    manager.getByText("Published. Guests now see this event and page.", {
      exact: true,
    }),
  ).toBeVisible();
  await visitor.reload();
  const publicWinners = visitor.getByRole("region", {
    name: "Published demonstration winners",
    exact: true,
  });
  await expect(
    publicWinners.getByText("Demo winner A", { exact: true }),
  ).toBeVisible();
  const html = await visitor.content();
  for (const privateValue of [
    ...draw.snapshot.candidates.map((entry) => entry.label),
    draw.digest,
    "order-gst-one",
    "Only this synthetic public alias is approved.",
  ])
    expect(html).not.toContain(privateValue);
  await visitor.setViewportSize({ width: 390, height: 844 });
  await publicWinners.scrollIntoViewIfNeeded();
  expect(
    await visitor.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await publicWinners.screenshot({
    path: ".local/event-draw-public-phone.png",
  });
  await manager.goto(`/admin/events/${eventId}?tab=prizes&prizeView=draws`);
  await panel
    .getByRole("button", {
      name: "Open draw Synthetic browser draw",
      exact: true,
    })
    .click();
  await manager.setViewportSize({ width: 390, height: 900 });
  expect(
    await manager.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel.screenshot({ path: ".local/event-draw-result-phone.png" });
  await panel
    .getByLabel("Draw actions", { exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Withdraw public winners", exact: true })
    .click();
  const withdrawal = manager.getByRole("dialog", {
    name: "Withdraw public winners",
    exact: true,
  });
  await withdrawal
    .getByRole("textbox", { name: "Reason for this decision", exact: true })
    .fill("Finished the public example; retain the private result.");
  await withdrawal
    .getByRole("checkbox", {
      name: "I reviewed this demonstration decision.",
      exact: true,
    })
    .check();
  await withdrawal
    .getByRole("button", { name: "Withdraw names", exact: true })
    .click();
  await expect(withdrawal).toHaveCount(0);
  await visitor.reload();
  await expect(publicWinners).toHaveCount(0);
  await manager.setViewportSize({ width: 1440, height: 1000 });
}
