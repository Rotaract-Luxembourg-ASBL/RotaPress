import { randomUUID } from "node:crypto";
import {
  expect,
  type APIResponse,
  type Browser,
  type Page,
} from "@playwright/test";
import { smokeOrigin } from "../../scripts/smoke_origin.mjs";
import type {
  FormDto,
  SubmissionReceipt,
} from "../../src/features/forms/form_types";

async function denied(response: APIResponse, status: number) {
  expect(response.status(), response.url()).toBe(status);
  expect(response.headers()["cache-control"], response.url()).toContain(
    "no-store",
  );
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
  const body: unknown = await response.json();
  expect(body).toEqual({ error: expect.any(String) });
}

/** B01 uses real OTP sessions and the disposable PostgreSQL database throughout. */
export async function apiSecurityJourney(
  owner: Page,
  member: Page,
  browser: Browser,
) {
  const anonymous = await browser.newContext();
  const headers = { origin: smokeOrigin };
  try {
    // Unauthenticated traffic must not poison an owner's sensitive-operation quota.
    for (const [path, attempts] of [
      ["setup", 11],
      ["recovery", 6],
    ] as const)
      for (let attempt = 0; attempt < attempts; attempt++)
        await denied(
          await anonymous.request.post(`/api/${path}`, { headers, data: {} }),
          401,
        );
    await denied(
      await owner.request.post("/api/recovery", {
        headers,
        data: { claim: "synthetic-invalid-owner-claim-0000000000000000" },
      }),
      409,
    );
    const created = await owner.request.post("/api/admin/forms", {
      headers,
      data: { kind: "contact", title: "API security contact fixture" },
    });
    expect(created.status()).toBe(201);
    const form = (await created.json()) as FormDto;
    await denied(await anonymous.request.get(`/api/forms/${form.id}`), 404);
    expect(
      (
        await owner.request.post(`/api/admin/forms/${form.id}/publish`, {
          headers,
          data: { expectedRevision: form.draftRevision },
        })
      ).ok(),
    ).toBe(true);
    const publicForm = await anonymous.request.get(`/api/forms/${form.id}`);
    expect(publicForm.ok()).toBe(true);
    const published = await publicForm.json();
    expect(Object.keys(published).sort()).toEqual([
      "definition",
      "id",
      "kind",
      "versionId",
      "versionNumber",
    ]);
    const accepted = await anonymous.request.post(
      `/api/forms/${form.id}/submit`,
      {
        headers,
        data: {
          requestId: randomUUID(),
          versionId: published.versionId,
          answers: {
            name: "Synthetic API visitor",
            email: "api-visitor@example.test",
            message: "Synthetic private response for the API security journey",
          },
        },
      },
    );
    expect(accepted.status()).toBe(201);
    const receipt = (await accepted.json()) as SubmissionReceipt;
    const responsePath = `/api/admin/forms/submissions/${receipt.id}`;
    const response = await owner.request.get(responsePath);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain("Synthetic private response");
    expect(response.headers()["cache-control"]).toContain("no-store");

    // An accepted write must persist, while the next draft remains private.
    const privateTitle = "Synthetic unpublished API security draft";
    expect(
      (
        await owner.request.post(`/api/admin/forms/${form.id}/save`, {
          headers,
          data: {
            expectedRevision: form.draftRevision,
            definition: { ...form.draft, title: privateTitle },
          },
        })
      ).ok(),
    ).toBe(true);
    expect(
      await (await owner.request.get(`/api/admin/forms/${form.id}`)).text(),
    ).toContain(privateTitle);
    expect(
      await (await anonymous.request.get(`/api/forms/${form.id}`)).text(),
    ).not.toContain(privateTitle);

    const protectedReads = [
      "/api/admin/members",
      "/api/admin/settings",
      "/api/admin/settings/domains",
      "/api/admin/forms",
      `/api/admin/forms/${form.id}`,
      `/api/admin/forms/${form.id}/settings`,
      `/api/admin/forms/${form.id}/webhook`,
      `/api/admin/forms/${form.id}/submissions`,
      `/api/admin/forms/${form.id}/submissions/export`,
      responsePath,
      "/api/admin/inbox",
      "/api/admin/media",
      "/api/admin/partners",
      "/api/admin/partners/selection",
      "/api/admin/cms/content",
      "/api/admin/cms/site",
      "/api/admin/cms/website",
      "/api/admin/cms/website/review?locale=en&scope=website",
      "/api/admin/cms/site/preview",
      "/api/admin/events",
      "/api/admin/events/directory",
      "/api/admin/calendar",
      "/api/admin/calendar/sources",
      "/api/admin/integrations/features",
      "/api/admin/integrations/google",
      "/api/admin/integrations/email",
      "/api/admin/integrations/luma",
      "/api/admin/integrations/luma/connection",
      "/api/admin/integrations/luma/webhook",
      `/api/admin/email-templates?kind=form&id=${form.id}`,
    ];
    const spoofed = {
      "x-role": "owner",
      "x-user-id": randomUUID(),
      "x-organization-id": randomUUID(),
      "x-middleware-subrequest":
        "middleware:middleware:middleware:middleware:middleware",
    };
    for (const path of protectedReads) {
      await denied(
        await anonymous.request.get(path, {
          headers: {
            ...spoofed,
            cookie: "better-auth.session_token=forged.invalid",
          },
        }),
        401,
      );
      await denied(await member.request.get(path, { headers: spoofed }), 403);
    }
    for (const path of [
      "/api/account",
      "/api/guest",
      "/api/registrations",
      "/api/calendar/subscriptions",
    ])
      await denied(await anonymous.request.get(path), 401);
    await denied(
      await member.request.post("/api/admin/forms", {
        headers: { ...headers, ...spoofed },
        data: { kind: "contact" },
      }),
      403,
    );
    await denied(
      await member.request.patch("/api/admin/members", {
        headers,
        data: { membershipId: randomUUID(), status: "approved", role: "owner" },
      }),
      403,
    );
    await denied(
      await member.request.post(`/api/admin/forms/${form.id}/publish`, {
        headers,
        data: { expectedRevision: form.draftRevision + 1 },
      }),
      403,
    );

    // A legitimate owner's cookie never makes a cross-site mutation legitimate.
    const mutations: [string, string][] = [
      ["PATCH", "/api/admin/settings"],
      ["PATCH", "/api/admin/members"],
      ["POST", "/api/admin/settings/domains"],
      ["POST", "/api/admin/forms"],
      ["DELETE", `/api/admin/forms/${form.id}`],
      ["PATCH", responsePath],
      ["POST", "/api/admin/cms/content"],
      ["POST", "/api/admin/partners"],
      ["POST", "/api/admin/media"],
      ["POST", "/api/admin/events"],
      ["POST", "/api/admin/events/directory"],
      ["POST", "/api/admin/calendar"],
      ["POST", "/api/admin/email-templates"],
      ["POST", "/api/admin/integrations/google"],
      ["POST", "/api/admin/integrations/email"],
      ["POST", "/api/admin/integrations/features"],
      ["POST", "/api/admin/integrations/luma"],
      ["POST", "/api/admin/integrations/luma/connection"],
      ["POST", "/api/admin/integrations/luma/webhook"],
      ["PATCH", "/api/account"],
      ["POST", "/api/membership"],
      ["POST", "/api/calendar/subscriptions"],
      ["POST", "/api/auth/sign-out"],
      ["POST", "/api/email/unsubscribe"],
      ["POST", "/api/setup"],
      ["POST", "/api/recovery"],
      ["POST", `/api/forms/${form.id}/submit`],
    ];
    for (const [method, path] of mutations)
      await denied(
        await owner.request.fetch(path, {
          method,
          headers: { origin: "https://untrusted.example" },
          data: {},
        }),
        403,
      );
    for (const origin of [undefined, "null"])
      await denied(
        await owner.request.post(`/api/admin/forms/${form.id}/publish`, {
          headers: origin ? { origin } : {},
          data: { expectedRevision: 2 },
        }),
        403,
      );
    const preflight = await owner.request.fetch("/api/admin/settings", {
      method: "OPTIONS",
      headers: {
        origin: "https://untrusted.example",
        "access-control-request-method": "PATCH",
      },
    });
    expect(preflight.status()).toBe(403);
    expect(preflight.headers()["access-control-allow-origin"]).toBeUndefined();

    // Reject unsupported actions and malformed inputs instead of reporting a false save.
    await denied(
      await owner.request.post(`/api/admin/forms/${form.id}/unknown-action`, {
        headers,
        data: {},
      }),
      404,
    );
    await denied(
      await owner.request.post(`/api/admin/forms/${form.id}/save`, {
        headers,
        data: {
          expectedRevision: 2,
          definition: form.draft,
          organizationId: randomUUID(),
        },
      }),
      400,
    );
    await denied(
      await owner.request.post(`/api/admin/forms/${form.id}/save`, {
        headers: { ...headers, "content-type": "text/plain" },
        data: "{}",
      }),
      415,
    );
    await denied(
      await owner.request.post(`/api/admin/forms/${form.id}/save`, {
        headers: { ...headers, "content-type": "application/json" },
        data: "x".repeat(512 * 1024 + 1),
      }),
      413,
    );
    const final = await owner.request.get(`/api/admin/forms/${form.id}`);
    expect((await final.json()).draftRevision).toBe(form.draftRevision + 1);
    expect((await owner.request.get("/api/auth/get-session")).ok()).toBe(true);
    const cookies = await owner.context().cookies();
    const session = cookies.find((cookie) =>
      cookie.name.endsWith("session_token"),
    );
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");
  } finally {
    await anonymous.close();
  }
}
