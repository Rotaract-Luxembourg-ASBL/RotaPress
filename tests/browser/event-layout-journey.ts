import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import { eventLayouts } from "../../src/features/events/event_layouts";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";

/** B01 uses the existing private preset and real owner; no extra identities or live hosting. */
export async function eventLayoutJourney(
  editor: Page,
  visitor: Page,
  eventId: string,
) {
  await editor.setViewportSize({ width: 1440, height: 1000 });
  await editor.goto(`/admin/events/${eventId}`);
  await editor
    .getByRole("combobox", { name: "Visibility when published" })
    .selectOption("public");
  await editor
    .getByRole("button", { name: "Save event draft", exact: true })
    .click();
  await expect(
    editor.getByText("Event draft saved. It remains private."),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Event page", exact: true }).click();
  await editor
    .getByRole("button", { name: "Choose a layout", exact: true })
    .click();
  const picker = editor.getByRole("dialog", {
    name: "Choose an event layout",
    exact: true,
  });
  await expect(picker.getByRole("radio")).toHaveCount(10);
  await picker
    .getByRole("radio", { name: "Rotaract signature", exact: true })
    .focus();
  await editor.keyboard.press("ArrowRight");
  await expect(
    picker.getByRole("radio", { name: "Gala evening", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await picker.screenshot({
    path: ".local/event-layout-catalogue-desktop.png",
  });
  await editor.setViewportSize({ width: 390, height: 844 });
  expect(await picker.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await picker.screenshot({ path: ".local/event-layout-catalogue-phone.png" });
  await editor.setViewportSize({ width: 1440, height: 1000 });
  const preview = editor.getByRole("complementary", {
    name: "Live event preview",
    exact: true,
  });
  const frame = preview.frameLocator("iframe");
  for (const [index, layout] of eventLayouts.entries()) {
    if (index)
      await editor
        .getByRole("button", { name: "Choose a layout", exact: true })
        .click();
    await picker.getByRole("radio", { name: layout.name, exact: true }).click();
    await picker
      .getByRole("button", { name: `Use ${layout.name}`, exact: true })
      .click();
    await expect
      .poll(async () =>
        frame
          .locator(".cms-event-page")
          .evaluate((el) =>
            getComputedStyle(el).getPropertyValue("--club-accent"),
          ),
      )
      .toBe(layout.primary);
    await expect(frame.locator(".event-reference-hero")).toHaveAttribute(
      "data-layout",
      layout.layout,
    );
  }
  await editor
    .getByRole("textbox", { name: "Tagline", exact: true })
    .fill("A synthetic evening for the community.");
  await editor
    .getByRole("button", { name: "Choose a layout", exact: true })
    .click();
  await picker
    .getByRole("radio", { name: "Rotaract signature", exact: true })
    .click();
  await picker
    .getByRole("button", { name: "Use Rotaract signature", exact: true })
    .click();
  await expect(
    editor.getByRole("textbox", { name: "Tagline", exact: true }),
  ).toHaveValue("A synthetic evening for the community.");
  await editor
    .getByRole("button", { name: "Undo layout change", exact: true })
    .click();
  await expect(
    editor.getByRole("textbox", { name: "Tagline", exact: true }),
  ).toHaveValue("A synthetic evening for the community.");
  // Connected profiles use the central directory; this example deliberately has no invented people.
  await editor
    .getByRole("button", { name: "Add section", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Add Team from directory", exact: true })
    .click();
  await editor
    .getByRole("combobox", { name: "Content source", exact: true })
    .selectOption("category");
  await editor
    .getByRole("combobox", { name: "Category to display", exact: true })
    .selectOption("team");
  await expect(
    editor.getByRole("combobox", {
      name: "Add a published profile",
      exact: true,
    }),
  ).toHaveCount(0);
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    editor.getByText("Draft saved. Your public page has not changed."),
  ).toBeVisible();
  const pageId = new URL(editor.url()).searchParams.get("page")!;
  const saved = (await editor.request
    .get(`/api/admin/cms/content/${pageId}?locale=en`)
    .then((r) => r.json())) as CmsDetail;
  expect(
    saved.draft.data.content.some(
      (block) =>
        block.type === "PartnerCollection" &&
        block.props.selectionMode === "category" &&
        block.props.category === "team",
    ),
  ).toBe(true);
  const publicUrl = `/events/${saved.event!.slug}/en/website`;
  expect((await visitor.request.get(publicUrl)).status()).toBe(404);
  await editor
    .getByRole("button", { name: "Page settings", exact: true })
    .click();
  await expect(
    editor.getByRole("textbox", {
      name: "Standalone event address",
      exact: true,
    }),
  ).toHaveValue(publicUrl);
  await expect(
    editor.getByRole("link", {
      name: "Set up an event subdomain ↗",
      exact: true,
    }),
  ).toHaveAttribute("href", `/admin/settings?tab=domains&event=${eventId}`);
  editor.once("dialog", (dialog) => dialog.accept());
  await editor
    .getByRole("button", { name: "Publish changes", exact: true })
    .click();
  await expect(
    editor.getByText("Published. Guests now see this event and page."),
  ).toBeVisible();
  await visitor.goto(publicUrl);
  await expect(
    visitor.getByRole("heading", {
      name: "Synthetic networking starting copy",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();
  await expect(visitor.locator(".event-reference-hero h2")).toHaveText(
    "A synthetic evening for the community.",
  );
  await expect(
    visitor.getByRole("navigation", {
      name: "On this event page",
      exact: true,
    }),
  ).toBeVisible();
  const downloaded = visitor.waitForEvent("download");
  await visitor
    .getByRole("button", { name: "Add to calendar", exact: true })
    .click();
  const path = await (await downloaded).path();
  expect(await readFile(path!, "utf8")).toContain(
    "SUMMARY:Synthetic networking starting copy",
  );
  for (const [name, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    await visitor.setViewportSize({ width, height: 1000 });
    await visitor.evaluate(() => window.scrollTo(0, 0));
    expect(
      await visitor
        .getByRole("navigation", { name: "On this event page", exact: true })
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeLessThan(100);
    expect(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await visitor.screenshot({
      path: `.local/event-layout-public-${name}.png`,
    });
    await visitor.locator(".event-reference-footer").scrollIntoViewIfNeeded();
    await visitor.screenshot({
      path: `.local/event-layout-footer-${name}.png`,
    });
    await editor.setViewportSize({ width, height: 1000 });
    await editor.getByRole("button", { name: "Content", exact: true }).click();
    expect(
      await editor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await editor.screenshot({ path: `.local/event-layout-editor-${name}.png` });
  }
  await visitor.goto("/events");
  await expect(
    visitor.getByRole("link", {
      name: "Synthetic networking starting copy",
      exact: true,
    }),
  ).toHaveAttribute("href", publicUrl);
  await editor.setViewportSize({ width: 1440, height: 1000 });
}
