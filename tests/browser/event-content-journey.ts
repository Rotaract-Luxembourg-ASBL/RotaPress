import { expect, type FrameLocator, type Page } from "@playwright/test";
import { smokeOrigin as origin } from "../../scripts/smoke_origin.mjs";

const contactTitle = "Talk to the synthetic event team";
const contactText = "Ask about this illustrative community afternoon.";
const contactEmail = "synthetic-event-team@example.test";
const contactPhone = "+1 202 555 0100";
const contactWebsite = "https://example.test/community-event";
const flyerTitle = "Community afternoon flyer";
const flyerAlt = "Synthetic green community event flyer";
const flyerCaption = "Illustrative flyer for the local browser journey.";
const shareTitle = "Invite someone to this event";
const contentBlocks =
  ".event-contact-block, .event-flyer-block, .event-share-block";

async function chooseExistingImage(editor: Page) {
  const picker = editor.getByRole("dialog", {
    name: "Choose an image",
    exact: true,
  });
  await expect(
    picker.getByRole("tab", { name: "Upload image", exact: true }),
  ).toHaveCount(0);
  await picker.getByRole("button", { name: /Synthetic event image/ }).click();
  await picker
    .getByRole("button", { name: "Insert image", exact: true })
    .click();
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

/** Reuses B01's real event manager, public image and existing publication. */
export async function eventContentDraftJourney(editor: Page) {
  await editor.getByRole("button", { name: "Content", exact: true }).click();
  const add = async (label: string) => {
    await editor
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    await editor
      .getByRole("button", { name: `Add ${label}`, exact: true })
      .click();
  };
  await add("Contact");
  await editor
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill(contactTitle);
  await editor
    .getByRole("textbox", { name: "Contact introduction", exact: true })
    .fill(contactText);
  await editor
    .getByRole("textbox", { name: "Public contact email", exact: true })
    .fill(contactEmail);
  await editor
    .getByRole("textbox", { name: "Public contact phone", exact: true })
    .fill(contactPhone);
  await editor
    .getByRole("textbox", { name: "Contact website (https)", exact: true })
    .fill(contactWebsite);
  await noHorizontalOverflow(editor);
  await editor.screenshot({ path: ".local/event-content-editor-desktop.png" });
  await editor.setViewportSize({ width: 320, height: 844 });
  await noHorizontalOverflow(editor);
  await editor.screenshot({ path: ".local/event-content-editor-phone.png" });
  await editor.setViewportSize({ width: 1440, height: 1000 });

  await add("Flyer");
  await editor
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill(flyerTitle);
  await editor
    .getByRole("button", { name: "Choose image", exact: true })
    .click();
  await chooseExistingImage(editor);
  const imageSource = await editor
    .locator(".media-picker-preview img")
    .getAttribute("src");
  const assetId = new URL(imageSource!, origin).pathname.split("/").at(-1)!;
  await editor
    .getByRole("textbox", { name: "Flyer image description", exact: true })
    .fill(flyerAlt);
  await editor
    .getByRole("textbox", { name: "Flyer caption", exact: true })
    .fill(flyerCaption);

  await add("Share event");
  await editor
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill(shareTitle);
  await editor
    .locator("summary")
    .filter({ hasText: /^Section appearance$/ })
    .click();
  await editor
    .getByRole("combobox", { name: "Section background", exact: true })
    .selectOption("dark");
  await editor
    .getByRole("button", { name: "Page settings", exact: true })
    .click();
  await editor
    .getByRole("region", { name: "Sharing image", exact: true })
    .getByRole("button", { name: "Choose image", exact: true })
    .click();
  await chooseExistingImage(editor);
  await expect(
    editor
      .getByRole("region", { name: "Sharing image", exact: true })
      .locator("img"),
  ).toHaveAttribute("src", `/media/${assetId}`);
  await editor.screenshot({ path: ".local/event-content-sharing-image.png" });

  // Hiding keeps authored contact details; restoring exposes the same input.
  await editor
    .getByRole("button", { name: "Page layout", exact: true })
    .click();
  await editor
    .getByRole("checkbox", { name: "Show Contact", exact: true })
    .uncheck();
  await editor
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  const preview = editor.getByRole("dialog", {
    name: "Preview changes",
    exact: true,
  });
  const frame = preview.frameLocator('iframe[title="Unsaved website preview"]');
  await expect(frame.locator(".event-contact-block")).toHaveCount(0);
  await expect(
    frame.getByRole("heading", { name: flyerTitle, exact: true }),
  ).toBeVisible();
  await preview
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await editor
    .getByRole("checkbox", { name: "Show Contact", exact: true })
    .check();
  await editor.getByRole("button", { name: "Content", exact: true }).click();
  await editor
    .getByRole("navigation", { name: "Event page editor", exact: true })
    .getByRole("button", { name: "Edit Contact", exact: true })
    .click();
  await expect(
    editor.getByRole("textbox", { name: "Public contact email", exact: true }),
  ).toHaveValue(contactEmail);
  return assetId;
}

export async function expectEventContentPreview(
  frame: FrameLocator,
  assetId: string,
) {
  await expect(
    frame.getByRole("heading", { name: contactTitle, exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByRole("img", { name: flyerAlt, exact: true }),
  ).toHaveAttribute("src", `/media/${assetId}`);
  const share = frame.locator(".event-share-block");
  await expect(
    share.getByRole("heading", { name: shareTitle, exact: true }),
  ).toBeVisible();
  await expect(
    share.getByRole("button", { name: "Copy link", exact: true }),
  ).toBeDisabled();
  await expect(
    share.getByRole("button", { name: "Share event", exact: true }),
  ).toBeDisabled();
  await expect(
    share.getByRole("textbox", { name: "Event link", exact: true }),
  ).toHaveCount(0);
}

export async function expectEventContentPrivate(visitor: Page) {
  await expect(visitor.locator(contentBlocks)).toHaveCount(0);
  await expect(visitor.locator('meta[property="og:image"]')).toHaveCount(0);
}

export async function eventContentPublishedJourney(
  visitor: Page,
  assetId: string,
  slug: string,
  revisionId: string,
) {
  const canonicalUrl = `${origin}/events/${slug}/en/website`;
  const contact = visitor.locator(".event-contact-block");
  await expect(
    contact.getByRole("heading", { name: contactTitle, exact: true }),
  ).toBeVisible();
  await expect(contact.getByText(contactText, { exact: true })).toBeVisible();
  await expect(
    contact.getByRole("link", { name: contactEmail, exact: true }),
  ).toHaveAttribute("href", `mailto:${encodeURIComponent(contactEmail)}`);
  await expect(
    contact.getByRole("link", { name: contactPhone, exact: true }),
  ).toHaveAttribute("href", "tel:+12025550100");
  await expect(
    contact.getByRole("link", { name: "Visit event website", exact: true }),
  ).toHaveAttribute("href", contactWebsite);
  const flyer = visitor.locator(".event-flyer-block");
  await expect(
    flyer.getByRole("img", { name: flyerAlt, exact: true }),
  ).toHaveAttribute("src", `/media/${assetId}`);
  await expect(flyer.getByText(flyerCaption, { exact: true })).toBeVisible();
  await expect(
    flyer.getByRole("link", { name: "Open flyer image", exact: true }),
  ).toHaveAttribute("href", `/media/${assetId}`);
  await expect(visitor.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    canonicalUrl,
  );
  await expect(visitor.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    `${origin}/media/${assetId}?v=${revisionId}`,
  );
  const share = visitor.locator(".event-share-block");
  const link = share.getByRole("textbox", { name: "Event link", exact: true });
  await expect(link).toHaveValue(canonicalUrl);
  await expect(link).toHaveAttribute("readonly", "");
  expect(canonicalUrl).not.toBe(visitor.url());
  await visitor
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await visitor.bringToFront();
  await share.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(share.getByRole("status")).toHaveText("Event link copied.");
  expect(await visitor.evaluate(() => navigator.clipboard.readText())).toBe(
    canonicalUrl,
  );
  await visitor.setViewportSize({ width: 1440, height: 1000 });
  await noHorizontalOverflow(visitor);
  await contact.scrollIntoViewIfNeeded();
  await visitor.screenshot({ path: ".local/event-content-public-desktop.png" });
  await visitor.setViewportSize({ width: 320, height: 844 });
  await noHorizontalOverflow(visitor);
  await contact.scrollIntoViewIfNeeded();
  await visitor.screenshot({ path: ".local/event-content-public-phone.png" });
  await share.screenshot({ path: ".local/event-content-share-phone.png" });
  await visitor.setViewportSize({ width: 1440, height: 1000 });
}
