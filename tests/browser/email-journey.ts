import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import type { EmailWorkspace } from "../../src/integrations/email/email_schemas";

/** Continues B02 using the real OTP owner session and local Mailpit only. */
export async function emailJourney(page: Page, anonymous: Page) {
  const errors: string[] = [];
  const collect = (error: Error) => errors.push(error.message);
  page.on("pageerror", collect);
  const workspace = async () =>
    (
      await page.request.get("/api/admin/integrations/email")
    ).json() as Promise<EmailWorkspace>;
  expect(
    (await anonymous.request.get("/api/admin/integrations/email")).status(),
  ).toBe(401);
  await page.goto("/admin/integrations");
  await page.getByRole("link", { name: "Open Email", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Email", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Sending to local Mailpit capture"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send test", exact: true }).click();
  await expect(
    page.getByText(/Test sent to your signed-in email address/),
  ).toBeVisible();
  const me = (await page.request.get("/api/me").then((r) => r.json())) as {
    actor: { email: string };
  };
  const mailbox = (await fetch("http://127.0.0.1:18025/api/v1/messages").then(
    (r) => r.json(),
  )) as {
    messages: { ID: string; Subject: string; To: { Address: string }[] }[];
  };
  expect(
    mailbox.messages.some(
      (m) =>
        m.Subject === "RotaPress email connection test" &&
        m.To.some((to) => to.Address === me.actor.email),
    ),
  ).toBe(true);

  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add email connection" });
  await dialog
    .getByLabel("Connection name", { exact: true })
    .fill("Synthetic Resend");
  await dialog
    .getByLabel("Sender name", { exact: true })
    .fill("Synthetic community");
  await dialog
    .getByLabel("Sender email", { exact: true })
    .fill("hello@example.test");
  const secret = `re_${randomBytes(24).toString("hex")}`;
  await dialog.getByLabel("Resend API key", { exact: true }).fill(secret);
  await dialog
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const resend = page.getByRole("article", {
    name: "Synthetic Resend",
    exact: true,
  });
  await expect(resend.getByText("Not tested", { exact: true })).toBeVisible();
  await expect(
    resend.getByRole("button", { name: "Send test", exact: true }),
  ).toBeDisabled();
  expect(JSON.stringify(await workspace()).includes(secret)).toBe(false);
  await resend
    .getByLabel("Connection actions for Synthetic Resend", { exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    resend.getByRole("button", { name: "Edit connection" }),
  ).not.toBeVisible();
  await resend
    .getByLabel("Connection actions for Synthetic Resend", { exact: true })
    .click();
  await resend.getByRole("button", { name: "Edit connection" }).click();
  const edit = page.getByRole("dialog", { name: "Edit email connection" });
  await expect(edit.getByLabel("Resend API key", { exact: true })).toHaveValue(
    "",
  );
  await edit
    .getByLabel("Connection name", { exact: true })
    .fill("Synthetic Resend saved");
  await edit
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(edit).not.toBeVisible();
  const updated = page.getByRole("article", {
    name: "Synthetic Resend saved",
    exact: true,
  });
  await expect(updated).toBeVisible();
  await updated
    .getByLabel("Connection actions for Synthetic Resend saved", {
      exact: true,
    })
    .click();
  await updated.getByRole("button", { name: "Delete connection" }).click();
  const deletion = page.getByRole("dialog", {
    name: "Delete email connection?",
    exact: true,
  });
  await deletion
    .getByRole("button", { name: "Delete connection", exact: true })
    .click();
  await expect(updated).not.toBeVisible();
  expect((await workspace()).connections).toHaveLength(0);

  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  await page
    .getByLabel("Heading", { exact: true })
    .fill("Community calendar news");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Your community calendar has changed. View the latest plans.");
  await expect(
    page
      .frameLocator('iframe[title="Email design preview"]')
      .getByRole("heading", { name: "Community calendar news" }),
  ).toBeVisible();
  await expect(
    page
      .frameLocator('iframe[title="Email design preview"]')
      .getByRole("link", { name: /Unsubscribe/ }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Connections", exact: true }).click();
  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  await expect(page.getByLabel("Heading", { exact: true })).toHaveValue(
    "Community calendar news",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Sending still uses the published template.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await workspace()).templates.find((t) => t.key === "calendar_update")
      ?.published,
  ).toBeNull();
  await page.reload();
  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  await expect(page.getByLabel("Heading", { exact: true })).toHaveValue(
    "Community calendar news",
  );
  await page
    .getByRole("button", { name: "Publish template", exact: true })
    .click();
  await expect(
    page.getByText("Template published. Future emails use this design.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await workspace()).templates.find((t) => t.key === "calendar_update")
      ?.published?.heading,
  ).toBe("Community calendar news");
  await page.getByRole("button", { name: "Plain text", exact: true }).click();
  await expect(page.locator(".email-preview pre")).toContainText(
    "Stop emails for this calendar",
  );
  await page.getByRole("button", { name: "Email design", exact: true }).click();
  for (const [width, label] of [
    [1440, "desktop"],
    [390, "phone"],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator(".email-preview").scrollIntoViewIfNeeded();
    await expect(
      page
        .frameLocator('iframe[title="Email design preview"]')
        .getByRole("heading", { name: "Community calendar news", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/email-templates-${label}.png`,
      fullPage: true,
      mask: [page.locator(".admin-account")],
    });
    if (label === "phone")
      await page
        .locator(".email-preview")
        .screenshot({ path: ".local/email-preview-phone.png" });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(errors).toEqual([]);
  page.off("pageerror", collect);
}
