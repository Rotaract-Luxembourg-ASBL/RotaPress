import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import { eventDraftJourney } from "./events-journey";
import { googleAuthJourney } from "./google-auth-journey";
import { apiSecurityJourney } from "./api-security-journey";
import { adminHeaderJourney } from "./admin-header-journey";
import {
  memberWorkspaceJourney,
  domainSettingsJourney,
} from "./member-workspace-journey";

const ownerEmail = `owner-${randomUUID()}@example.test`;
const applicantEmail = `applicant-${randomUUID()}@example.test`;
const claim = randomBytes(32).toString("base64url");
let database: Pool;
test.use({ actionTimeout: 10_000 });

type MessageSummary = { ID: string; To: Array<{ Address: string }> };

async function mailboxCode(
  email: string,
  priorMessageIds: Set<string>,
): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch("http://127.0.0.1:18025/api/v1/messages");
        const mailbox = (await response.json()) as {
          messages: MessageSummary[];
        };
        const message = mailbox.messages.find(
          (item) =>
            !priorMessageIds.has(item.ID) &&
            item.To.some((recipient) => recipient.Address === email),
        );
        if (!message) return false;
        const detail = await fetch(
          `http://127.0.0.1:18025/api/v1/message/${message.ID}`,
        );
        const payload = (await detail.json()) as { Text: string };
        code = payload.Text.match(/\b\d{6}\b/)?.[0];
        return Boolean(code);
      },
      { message: "A real verification email arrives in project Mailpit" },
    )
    .toBe(true);
  if (!code) throw new Error("Verification email did not contain a code.");
  return code;
}

async function signIn(page: Page, email: string, next: string) {
  const mailbox = (await (
    await fetch("http://127.0.0.1:18025/api/v1/messages")
  ).json()) as { messages: MessageSummary[] };
  const priorMessageIds = new Set(
    mailbox.messages.map((message) => message.ID),
  );
  await page.goto(`/sign-in?next=${next}`);
  await expect(page.getByLabel("Your name", { exact: true })).toHaveCount(0);
  await page.getByLabel("Email address").fill(email);
  async function sendCode() {
    const result = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          "/api/auth/email-otp/send-verification-otp" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send verification code" }).click();
    return result;
  }
  let response = await sendCode();
  if (response.status() === 429) {
    // All loopback clients share the real server bucket. Respect its retry
    // interval when this multi-account journey consumes the five-code budget.
    const retrySeconds = Number(response.headers()["x-retry-after"]);
    expect(retrySeconds).toBeGreaterThan(0);
    expect(retrySeconds).toBeLessThanOrEqual(60);
    await delay(retrySeconds * 1000);
    response = await sendCode();
  }
  expect(response.ok(), "The sender accepted the sign-in email").toBe(true);
  await expect(page.getByLabel("Verification code")).toBeVisible();
  const code = await mailboxCode(email, priorMessageIds);
  const stored = await database.query(
    "SELECT value FROM club.verification WHERE identifier LIKE $1",
    [`%${email}%`],
  );
  expect(stored.rows.length).toBeGreaterThan(0);
  expect(
    stored.rows.every((row: { value: string }) => !row.value.includes(code)),
    "OTP storage is hashed",
  ).toBe(true);
  await page.getByLabel("Verification code").fill(code);
  const verifiedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/auth/sign-in/email-otp" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  expect((await verifiedResponse).headers()["cache-control"]).toContain(
    "no-store",
  );
  await expect(page).toHaveURL(new URL(next, smokeOrigin).href);
  const session = await page.request.get("/api/auth/get-session");
  expect(session.ok()).toBe(true);
  expect((await session.json()).user.name).toBe("");
}

test.beforeAll(async () => {
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  if (!env.TEST_MIGRATION_DATABASE_URL)
    throw new Error("Run local setup first.");
  const target = new URL(env.TEST_MIGRATION_DATABASE_URL);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "55432" ||
    target.pathname !== "/rotapress_test"
  ) {
    throw new Error(
      "Refusing to reset any database except the dedicated local rotapress_test target.",
    );
  }
  database = new Pool({ connectionString: env.TEST_MIGRATION_DATABASE_URL });
  await database.query(
    'TRUNCATE club.installation, club.organization, club.membership, club.audit_entry, club.rate_limit, club.verification, club."user" CASCADE',
  );
  await database.query(
    "INSERT INTO club.installation (id, nominated_email, claim_hash, claim_expires_at) VALUES (1,$1,$2,now()+interval '10 minutes')",
    [ownerEmail, createHash("sha256").update(claim).digest("hex")],
  );
});

test.afterAll(async () => {
  await database?.end();
});

test("B01: verified owner setup, approval, live revocation and saved identity", async ({
  page,
  browser,
}) => {
  test.setTimeout(210_000);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await expect(
    page.getByRole("heading", { name: "A secure beginning." }),
  ).toBeVisible();
  await page.goto("/setup");
  await expect(
    page.getByRole("link", { name: "Verify owner email" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".local/setup-brand-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("About owner access", { exact: true }).click();
  await expect(
    page.getByText("Email verification alone cannot claim this installation.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Mailpit/)).toHaveCount(0);
  const refused = await page.request.post(
    "/api/auth/email-otp/send-verification-otp",
    {
      headers: { origin: smokeOrigin },
      data: { email: applicantEmail, type: "sign-in" },
    },
  );
  expect(refused.status()).toBe(409);
  expect(await refused.text()).toContain("Owner sign-in is unavailable");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local/setup-brand-phone.png",
    fullPage: true,
  });
  await signIn(page, ownerEmail, "/setup");
  await page
    .getByLabel("Club name", { exact: true })
    .fill("Fictional Community Club");
  await page
    .getByLabel("Tagline", { exact: true })
    .fill("Good people. Shared purpose.");
  await page
    .getByLabel("About your club")
    .fill("A synthetic local club used to verify RotaPress.");
  await page
    .getByRole("button", { name: "Rotaract cranberry", exact: true })
    .click();
  await expect(page.locator('input[name="accentColor"]')).toHaveValue(
    "#d41367",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local/setup-details-phone.png",
    fullPage: true,
  });
  await page
    .getByLabel("Installation claim")
    .fill("invalid-claim-for-local-browser-check-0000");
  await page
    .getByRole("button", { name: "Create club and claim ownership" })
    .click();
  await expect(page.locator(".setup-card").getByRole("alert")).toContainText(
    "setup claim",
  );
  await expect(page.getByLabel("Club name", { exact: true })).toHaveValue(
    "Fictional Community Club",
  );
  await expect(page.locator('input[name="accentColor"]')).toHaveValue(
    "#d41367",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Installation claim").fill(claim);
  await page
    .getByRole("button", { name: "Create club and claim ownership" })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
  const savedClub = await page.request.get("/api/club");
  expect((await savedClub.json()).accentColor).toBe("#d41367");
  const method = await database.query(
    'SELECT auth_method FROM club.session s JOIN club."user" u ON s.user_id=u.id WHERE u.email=$1',
    [ownerEmail],
  );
  expect(method.rows[0]?.auth_method).toBe("email-otp");
  await googleAuthJourney(page, browser);
  await adminHeaderJourney(page);

  const applicantContext = await browser.newContext();
  const applicant = await applicantContext.newPage();
  await signIn(applicant, applicantEmail, "/membership");
  await applicant
    .getByRole("button", { name: /apply|request membership/i })
    .click();
  await expect(
    applicant.getByText(/application.*review|pending/i).first(),
  ).toBeVisible();
  expect((await applicant.request.get("/api/admin/members")).status()).toBe(
    403,
  );
  await applicant.goto("/admin");
  await expect(applicant).toHaveURL(/\/membership$/);

  await page.goto("/admin/members");
  await page
    .getByRole("group", { name: "Membership views" })
    .getByRole("button", { name: /Pending applications/ })
    .click();
  const row = page.getByRole("listitem").filter({ hasText: applicantEmail });
  await row.getByRole("button", { name: "Manage access" }).click();
  const access = page.getByRole("dialog", { name: "Manage access" });
  await access
    .getByRole("combobox", { name: "Membership status", exact: true })
    .selectOption("approved");
  await access
    .getByRole("combobox", { name: "Club role", exact: true })
    .selectOption("member");
  await access.getByRole("button", { name: "Review changes" }).click();
  expect((await applicant.request.get("/api/admin/members")).status()).toBe(
    403,
  );
  await access.getByRole("button", { name: "Confirm access change" }).click();
  await expect(
    page.getByText("Membership updated.", { exact: false }),
  ).toBeVisible();
  await memberWorkspaceJourney(applicant);
  await apiSecurityJourney(page, applicant, browser);
  await page
    .getByRole("group", { name: "Membership views" })
    .getByRole("button", { name: /^Approved members/ })
    .click();
  await row.getByRole("button", { name: "Manage access" }).click();
  await access
    .getByRole("combobox", { name: "Club role", exact: true })
    .selectOption("administrator");
  await access.getByRole("button", { name: "Review changes" }).click();
  await access.getByRole("button", { name: "Confirm access change" }).click();
  await expect(
    page.getByText("Membership updated.", { exact: false }),
  ).toBeVisible();
  await applicant.goto("/admin");
  await expect(applicant).toHaveURL(/\/admin$/);
  expect((await applicant.request.get("/api/admin/members")).status()).toBe(
    200,
  );
  const managedEvent = await eventDraftJourney(
    page,
    applicant,
    browser,
    signIn,
    { ownerEmail, managerEmail: applicantEmail },
  );

  // Same authenticated session is denied as soon as current membership is suspended.
  await page
    .getByRole("group", { name: "Membership views" })
    .getByRole("button", { name: /^Approved members/ })
    .click();
  await row.getByRole("button", { name: "Manage access" }).click();
  await access
    .getByRole("combobox", { name: "Membership status", exact: true })
    .selectOption("suspended");
  await access.getByRole("button", { name: "Review changes" }).click();
  await access.getByRole("button", { name: "Confirm access change" }).click();
  await expect
    .poll(async () =>
      (await applicant.request.get("/api/admin/members")).status(),
    )
    .toBe(403);
  await expect
    .poll(async () =>
      (
        await applicant.request.get(`/api/admin/events/${managedEvent}`)
      ).status(),
    )
    .toBe(403);
  const forged = await applicant.request.patch("/api/admin/members", {
    headers: { origin: smokeOrigin },
    data: { membershipId: randomUUID(), status: "approved", role: "owner" },
  });
  expect(forged.status()).toBe(403);
  const csrf = await page.request.patch("/api/admin/settings", {
    headers: { origin: "https://untrusted.example" },
    data: {},
  });
  expect(csrf.status()).toBe(403);
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers: { origin: smokeOrigin },
        data: {},
      })
    ).status(),
  ).toBe(404);

  await page.goto("/admin/settings");
  await page
    .getByRole("combobox", { name: "Time zone", exact: true })
    .fill("Mars/Invalid");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".notice-error")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Time zone", exact: true }),
  ).toHaveValue("Mars/Invalid");
  await page
    .getByRole("combobox", { name: "Time zone", exact: true })
    .fill("Europe/Luxembourg");
  await page
    .getByLabel("Club name", { exact: true })
    .fill("Fictional Community Together");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  const publicPage = await applicantContext.newPage();
  await publicPage.goto("/");
  await expect(
    publicPage
      .getByText("Fictional Community Together", { exact: true })
      .first(),
  ).toBeVisible();
  const publicIdentity = await publicPage.request.get("/api/club");
  expect((await publicIdentity.json()).name).toBe(
    "Fictional Community Together",
  );
  await publicPage.setViewportSize({ width: 390, height: 844 });
  expect(
    await publicPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await publicPage.screenshot({
    path: ".local/public-mobile.png",
    fullPage: true,
  });
  await publicPage.setViewportSize({ width: 1440, height: 1000 });
  await publicPage.screenshot({
    path: ".local/public-desktop.png",
    fullPage: true,
  });
  await domainSettingsJourney(page, smokeOrigin);
  await page.goto("/setup");
  await expect(page.getByText("Your club is already set up.")).toBeVisible();
  await page.goto("/admin");
  await page.getByLabel("Open account menu", { exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect
    .poll(async () => (await page.request.get("/api/admin/members")).status())
    .toBe(401);
  await applicantContext.close();
});
