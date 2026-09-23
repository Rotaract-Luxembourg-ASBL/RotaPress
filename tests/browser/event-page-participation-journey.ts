import { expect, type Page } from "@playwright/test";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import { formRemovalJourney } from "./form-removal-journey";
import { eventReadinessJourney } from "./event-readiness-journey";
import { eventPrizesJourney } from "./event-prizes-journey";
import {
  eventContentDraftJourney,
  eventContentPublishedJourney,
  expectEventContentPreview,
  expectEventContentPrivate,
} from "./event-content-journey";
import {
  eventPageSectionsJourney,
  publicClubStyle,
} from "./event-page-sections-journey";

const clubChrome = ".site-header, .public-header, .site-footer, .public-footer";

/** Extends B01's existing published event and real manager; no extra identity. */
export async function eventPageParticipationJourney(
  manager: Page,
  visitor: Page,
  eventId: string,
) {
  const enquiryTitle = "Synthetic event enquiry";
  const publicUrl = `/events/${eventId}/en/website`;
  await manager.setViewportSize({ width: 1440, height: 1000 });
  await manager.goto(`/admin/events/${eventId}?tab=participation`);
  const participation = manager.getByRole("region", {
    name: "Event forms and registration",
    exact: true,
  });
  await participation
    .getByRole("combobox", { name: "Form purpose", exact: true })
    .selectOption("event");
  await participation
    .getByRole("textbox", { name: "Form title", exact: true })
    .fill(enquiryTitle);
  await participation
    .getByRole("button", {
      name: "Create event form draft",
      exact: true,
    })
    .click();
  await participation
    .getByRole("link", { name: enquiryTitle, exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Publish form", exact: true })
    .click();
  await expect(
    manager.getByText(
      "Form published. Visitors now see your latest saved version.",
    ),
  ).toBeVisible();
  await manager
    .getByRole("link", { name: "Back to event", exact: true })
    .click();
  await manager
    .getByRole("region", {
      name: "Registration page placement",
      exact: true,
    })
    .getByRole("link", { name: "Open page editor · EN", exact: true })
    .click();
  await expect(manager).toHaveURL(/\/admin\/events\/[^/?]+\?tab=website&page=/);
  await expect(
    manager.locator(".editor-canvas, .editor-toolbar, .admin-sidebar"),
  ).toHaveCount(0);
  const pageId = new URL(manager.url()).searchParams.get("page")!;
  const detailUrl = `/api/admin/cms/content/${pageId}?locale=en`;
  const before = (await manager.request
    .get(detailUrl)
    .then((response) => response.json())) as CmsDetail;

  await visitor.goto("/");
  const originalClubStyle = await publicClubStyle(visitor);
  await visitor.goto(publicUrl);
  const originalPalette = await visitor
    .locator(".cms-event-page")
    .getAttribute("data-event-palette");
  await expect(visitor.locator(clubChrome)).toHaveCount(0);
  await expect(visitor.locator(".forms-public")).toHaveCount(0);
  await eventPageSectionsJourney(manager);
  const eventContentAssetId = await eventContentDraftJourney(manager);
  await manager
    .getByRole("button", { name: "Add section", exact: true })
    .click();
  await manager.getByRole("button", { name: "Add Form", exact: true }).click();
  await manager
    .getByRole("combobox", { name: "Event form", exact: true })
    .selectOption({ label: enquiryTitle });
  await expect(
    manager.getByRole("heading", {
      name: enquiryTitle,
      exact: true,
    }),
  ).toBeVisible();
  await manager
    .getByRole("button", { name: "Add section", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Add Event registration", exact: true })
    .click();
  await expect(
    manager
      .getByRole("region", { name: "Event registration preview", exact: true })
      .getByRole("button", { name: "Register", exact: true }),
  ).toBeDisabled();
  await manager
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  const preview = manager.getByRole("dialog", {
    name: "Preview changes",
    exact: true,
  });
  const frame = preview.frameLocator('iframe[title="Unsaved website preview"]');
  await expect(
    frame.getByRole("heading", { name: enquiryTitle, exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  await expect(
    frame
      .getByRole("region", { name: "Event registration preview", exact: true })
      .getByRole("button", { name: "Register", exact: true }),
  ).toBeDisabled();
  await expect(frame.locator(clubChrome)).toHaveCount(0);
  await expectEventContentPreview(frame, eventContentAssetId);
  await expect(
    frame.getByRole("navigation", { name: "Website navigation", exact: true }),
  ).toHaveCount(0);
  await expect(frame.locator(".cms-event-page")).toHaveAttribute(
    "data-event-palette",
    "warm",
  );
  await expect(frame.locator(".cms-faq, .cms-programme")).toHaveClass([
    "cms-block cms-faq",
    "cms-block cms-programme",
  ]);
  await expect(
    frame.getByRole("heading", {
      name: "Welcome and introductions",
      exact: true,
    }),
  ).toBeVisible();
  const previewed = (await manager.request
    .get(detailUrl)
    .then((response) => response.json())) as CmsDetail;
  expect(previewed.draft.id).toBe(before.draft.id);
  await visitor.reload();
  await expect(visitor.locator(".cms-event-page")).toHaveAttribute(
    "data-event-palette",
    originalPalette!,
  );
  await expect(
    visitor.getByRole("heading", { name: "Afternoon programme", exact: true }),
  ).toHaveCount(0);
  await expect(visitor.locator(".forms-public")).toHaveCount(0);
  await expectEventContentPrivate(visitor);
  await manager.screenshot({ path: ".local/event-inline-preview-desktop.png" });
  await preview
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(
    manager.getByText("Draft saved. Your public page has not changed.", {
      exact: true,
    }),
  ).toBeVisible();
  await visitor.reload();
  await expect(visitor.locator(".cms-event-page")).toHaveAttribute(
    "data-event-palette",
    originalPalette!,
  );
  await expect(
    visitor.getByRole("heading", { name: "Afternoon programme", exact: true }),
  ).toHaveCount(0);
  await expect(visitor.locator(".forms-public")).toHaveCount(0);
  await expectEventContentPrivate(visitor);
  const saved = (await manager.request
    .get(detailUrl)
    .then((response) => response.json())) as CmsDetail;
  expect(saved.draft.id).not.toBe(before.draft.id);
  expect(saved.publishedRevisionId).toBe(before.publishedRevisionId);
  expect(saved.draft.socialImageId).toBe(eventContentAssetId);
  expect(saved.draft.data.root.props.eventDesign).toMatchObject({
    palette: "warm",
    primaryColor: "#7f1d1d",
    font: "classic",
    width: "focused",
  });
  expect(saved.draft.data.root.props.eventHiddenSections ?? []).toEqual([]);
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
  await visitor.reload();
  await eventContentPublishedJourney(
    visitor,
    eventContentAssetId,
    saved.event!.slug,
    saved.draft.id,
  );
  await expect(visitor.locator(clubChrome)).toHaveCount(0);
  await expect(
    visitor.getByRole("navigation", {
      name: "Website navigation",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(visitor.locator(".cms-event-page")).toHaveAttribute(
    "data-event-palette",
    "warm",
  );
  expect(
    await visitor
      .locator(".cms-event-page")
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--cms-width"),
      ),
  ).toBe("880px");
  expect(
    await visitor
      .locator(".cms-event-page")
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--club-accent"),
      ),
  ).toBe("#7f1d1d");
  await expect(visitor.locator(".cms-faq, .cms-programme")).toHaveClass([
    "cms-block cms-faq",
    "cms-block cms-programme",
  ]);
  await visitor.locator(".cms-faq summary").click();
  await expect(
    visitor.getByText("Bring comfortable shoes.", { exact: true }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("heading", {
      name: "Welcome and introductions",
      exact: true,
    }),
  ).toBeVisible();
  await expect(visitor.locator("#main-content .forms-public h2")).toHaveText([
    enquiryTitle,
    "Synthetic event registration",
  ]);
  await expect(
    visitor
      .getByRole("region", { name: "Event registration", exact: true })
      .getByRole("link", { name: "Sign in to register", exact: true }),
  ).toBeVisible();

  // The placed enquiry is the actual event form, with its normal receipt.
  const enquiry = visitor.locator(".forms-public").filter({
    has: visitor.getByRole("heading", { name: enquiryTitle, exact: true }),
  });
  await enquiry
    .getByLabel("Your name", { exact: false })
    .fill("Synthetic event visitor");
  await enquiry
    .getByLabel("Your email", { exact: false })
    .fill("event-enquiry@example.test");
  await enquiry
    .getByLabel("Your message", { exact: false })
    .fill("A synthetic question from the event page.");
  await enquiry
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    enquiry.getByText("Your message has been received.", { exact: true }),
  ).toBeVisible();
  await visitor.goto("/");
  expect(await publicClubStyle(visitor)).toEqual(originalClubStyle);
  await visitor.goto(publicUrl);
  await eventReadinessJourney(manager, visitor, eventId, pageId);
  await formRemovalJourney(manager, visitor, eventId, enquiryTitle);
  await eventPrizesJourney(manager, visitor, eventId, pageId);
  return publicUrl;
}
