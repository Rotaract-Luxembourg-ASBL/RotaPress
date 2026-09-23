import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import * as schema from "../../db/schema";
import {
  AuthorizationService,
  type TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { InstallationService } from "../../src/core/installation/InstallationService";
import { MemberAccountService } from "../../src/features/members/MemberAccountService";
import { MembershipService } from "../../src/features/members/MembershipService";
import { DomainService } from "../../src/core/organization/DomainService";
import { OrganizationService } from "../../src/core/organization/OrganizationService";
import { FormService } from "../../src/features/forms/FormService";
import { SubmissionService } from "../../src/features/forms/SubmissionService";
import { InboxService } from "../../src/features/forms/InboxService";
import {
  formDefinitionSchema,
  starterDefinition,
} from "../../src/features/forms/form_schemas";
import { validateAnswers } from "../../src/features/forms/form_answers";
import { visibleFields } from "../../src/features/forms/ui/public-fields";
import { permittedBrowserOrigin } from "../../src/core/origin-policy";
import { publicMetadata } from "../../src/features/cms/public_metadata";
import { defaultSiteSettings } from "../../src/features/cms/cms_schemas";
import { defaultSiteSeo } from "../../src/features/cms/site_seo";
import { selectProfiles } from "../../src/features/partners/collection_selection";
import type { Database } from "../../src/infrastructure/database/client";

let pool: Pool;
let migrator: Pool;
let db: Database;
let authorization: AuthorizationService;
function connection(value: string | undefined) {
  if (!value) throw new Error("Run local setup first.");
  const url = new URL(value);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/rotapress_test"
  )
    throw new Error("Only the disposable local test database is allowed.");
  return value;
}
beforeAll(async () => {
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  pool = new Pool({ connectionString: connection(env.DATABASE_URL), max: 5 });
  migrator = new Pool({
    connectionString: connection(env.TEST_MIGRATION_DATABASE_URL),
    max: 2,
  });
  db = drizzle(pool, { schema });
  authorization = new AuthorizationService(db);
});
beforeEach(async () => {
  await migrator.query(
    'TRUNCATE club.installation, club.organization, club.membership, club.audit_entry, club."user" CASCADE',
  );
});
afterAll(async () => {
  await Promise.all([pool?.end(), migrator?.end()]);
});

async function identity(label: string): Promise<TrustedActor> {
  const id = randomUUID();
  const email = `${label}-${id}@example.test`;
  await db
    .insert(schema.user)
    .values({ id, name: label, email, emailVerified: true });
  // Domain-service fixture only. Browser acceptance uses real Better Auth OTP sessions.
  return {
    userId: id,
    email,
    emailVerified: true,
    sessionId: randomUUID(),
    authenticatedAt: new Date(),
    authMethod: "email-otp",
  };
}
async function installed() {
  const owner = await identity("owner");
  const claim = randomBytes(32).toString("hex");
  await migrator.query(
    "INSERT INTO club.installation (id,nominated_email,claim_hash,claim_expires_at) VALUES (1,$1,$2,$3)",
    [
      owner.email,
      createHash("sha256").update(claim).digest("hex"),
      new Date(Date.now() + 60000),
    ],
  );
  await new InstallationService(db).complete(owner, {
    claim,
    name: "Synthetic Experience Club",
    tagline: "",
    description: "",
    locale: "en",
    timezone: "Europe/Luxembourg",
    accentColor: "#25636b",
  });
  const scope = await authorization.require(owner, "settings.manage");
  return { owner, scope };
}

it("C02 keeps self profiles and signed-in response history private without granting staff access", async () => {
  const { owner, scope } = await installed();
  const person = await identity("member");
  const other = await identity("other");
  await db.insert(schema.membership).values({
    organizationId: scope.organizationId,
    userId: person.userId,
    status: "approved",
    role: "member",
  });
  const account = new MemberAccountService(db);
  const first = await account.workspace(person);
  const saved = await account.save(person, {
    expectedVersion: 0,
    profile: {
      ...first.profile,
      displayName: "Synthetic member",
      interests: "Community gardening",
    },
  });
  expect(saved.version).toBe(1);
  expect((await account.workspace(other)).profile.interests).toBe("");
  await expect(
    account.save(person, { expectedVersion: 0, profile: first.profile }),
  ).rejects.toMatchObject({ code: "PROFILE_CHANGED" });
  await expect(
    account.save(person, {
      expectedVersion: 1,
      userId: other.userId,
      profile: first.profile,
    }),
  ).rejects.toThrow();
  await expect(
    account.workspace({ ...person, emailVerified: false }),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    authorization.require(person, "settings.manage"),
  ).rejects.toMatchObject({ status: 403 });
  const forms = new FormService(db, authorization);
  const members = new MembershipService(db, authorization, forms);
  const submissions = new SubmissionService(db, authorization, members);
  const draft = await forms.create(owner, { kind: "contact" });
  const published = await forms.publish(owner, draft.id, {
    expectedRevision: draft.draftRevision,
  });
  const answers = {
    name: "Synthetic visitor",
    email: person.email,
    message: "Private submitted text",
  };
  await submissions.submit(person, draft.id, {
    versionId: published.publishedVersionId,
    requestId: randomUUID(),
    answers,
  });
  await submissions.submit(null, draft.id, {
    versionId: published.publishedVersionId,
    requestId: randomUUID(),
    answers,
  });
  expect((await account.workspace(person)).responses).toHaveLength(1);
  expect((await account.workspace(other)).responses).toHaveLength(0);
  expect(JSON.stringify(await account.workspace(person))).not.toContain(
    "Private submitted text",
  );
  const inbox = await new InboxService(db, authorization).list(owner, {
    formId: draft.id,
    kind: "contact",
  });
  expect(inbox.total).toBe(2);
  expect(inbox.counts.new).toBe(2);
  expect(
    (
      await new InboxService(db, authorization).list(owner, {
        kind: "membership",
      })
    ).total,
  ).toBe(0);
  await expect(
    new InboxService(db, authorization).list(person),
  ).rejects.toMatchObject({ status: 403 });
});

it("C02 permits routine settings with an older session and keeps security changes recent and owner-only", async () => {
  const { owner } = await installed();
  const organization = new OrganizationService(db, authorization, {
    enabled: async () => true,
    accepts: async () => true,
  });
  const current = await organization.settings(owner);
  const older = { ...owner, authenticatedAt: new Date(Date.now() - 3600000) };
  expect(
    (
      await organization.update(older, {
        ...current,
        tagline: "Updated normally",
      })
    ).tagline,
  ).toBe("Updated normally");
  await expect(
    organization.update(older, { ...current, staffAuthPolicy: "google" }),
  ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
  expect(
    permittedBrowserOrigin(
      "https://club.example.org",
      "https://club.example.org",
    ),
  ).toBe(true);
  for (const value of [
    null,
    "null",
    "*",
    "https://club.example.org.attacker.test",
    "http://club.example.org",
    "https://club.example.org/",
  ])
    expect(permittedBrowserOrigin(value, "https://club.example.org")).toBe(
      false,
    );
});

it("C02 verifies exact domain ownership without activating origins and enforces owner scope", async () => {
  const { owner, scope } = await installed();
  const outsider = await identity("outsider");
  let record = "";
  let lookups = 0;
  const domains = new DomainService(
    db,
    authorization,
    "http://127.0.0.1:4100",
    async (name) => {
      lookups++;
      expect(name).toBe("_rotapress.club.example.org");
      return [[record]];
    },
  );
  await expect(
    domains.add(outsider, { hostname: "club.example.org" }),
  ).rejects.toMatchObject({ status: 403 });
  for (const hostname of [
    "127.0.0.1",
    "localhost",
    "*.example.org",
    "https://example.org",
    "user@example.org",
    "club.example.org:443",
    "x.internal",
  ])
    await expect(domains.add(owner, { hostname })).rejects.toThrow();
  expect(lookups).toBe(0);
  const setup = await domains.add(owner, { hostname: "club.example.org" });
  expect(setup.items[0].verifiedAt).toBeNull();
  expect(setup.items[0].active).toBe(false);
  record = setup.items[0].recordValue;
  const verified = await domains.change(owner, {
    id: setup.items[0].id,
    operation: "verify",
  });
  expect(verified.items[0].verifiedAt).not.toBeNull();
  expect(verified.origin).toBe("http://127.0.0.1:4100");
  expect(verified.items[0].active).toBe(false);
  await expect(
    domains.change(owner, { id: setup.items[0].id, operation: "verify" }),
  ).rejects.toMatchObject({ status: 429 });
  expect(lookups).toBe(1);
  await expect(
    domains.change(outsider, { id: setup.items[0].id, operation: "remove" }),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (
      await domains.change(owner, {
        id: setup.items[0].id,
        operation: "remove",
      })
    ).items,
  ).toHaveLength(0);
  const failed = await domains.add(owner, { hostname: "club.example.org" });
  record = "wrong-proof";
  await expect(
    domains.change(owner, { id: failed.items[0].id, operation: "verify" }),
  ).rejects.toMatchObject({ code: "DNS_NOT_VERIFIED" });
  expect((await domains.workspace(owner)).items[0].verifiedAt).toBeNull();
  const [event] = await db
    .insert(schema.clubEvent)
    .values({
      organizationId: scope.organizationId,
      title: "Synthetic event domain",
      slug: "synthetic-event-domain",
      startsAt: new Date("2030-06-12T14:00:00Z"),
      timezone: "Europe/Luxembourg",
      createdBy: owner.userId,
    })
    .returning();
  await expect(
    domains.add(owner, {
      hostname: "night.example.org",
      eventId: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 404 });
  const eventSetup = await domains.add(owner, {
    hostname: "night.example.org",
    eventId: event.id,
  });
  expect(
    eventSetup.items.find((item) => item.hostname === "night.example.org"),
  ).toMatchObject({
    eventId: event.id,
    eventTitle: event.title,
    active: false,
    verifiedAt: null,
    destinationUrl:
      "http://127.0.0.1:4100/events/synthetic-event-domain/en/website",
  });
  await expect(
    domains.add(owner, {
      hostname: "other.example.org",
      eventId: event.id,
      organizationId: randomUUID(),
    }),
  ).rejects.toThrow();
  await expect(
    db
      .insert(schema.siteDomain)
      .values({
        organizationId: scope.organizationId,
        hostname: "constraint.example.org",
        eventId: randomUUID(),
        challenge: "synthetic-proof",
      }),
  ).rejects.toThrow();
});

it("C05 keeps compound visibility, conditional requirements and hidden-answer validation consistent", () => {
  const base = starterDefinition("contact");
  const field = base.fields[0];
  const definition = formDefinitionSchema.parse({
    ...base,
    fields: [
      {
        ...field,
        id: "interest",
        type: "choice",
        options: ["Volunteer", "Visit"],
      },
      { ...field, id: "available", type: "checkbox", required: false },
      {
        ...field,
        id: "skills",
        required: false,
        visibility: {
          mode: "all",
          rules: [
            { fieldId: "interest", operator: "equals", value: "Volunteer" },
            { fieldId: "available", operator: "equals", value: true },
          ],
        },
        validation: { minLength: 3, maxLength: 20 },
      },
      {
        ...field,
        id: "hours",
        type: "number",
        required: false,
        requiredWhen: {
          mode: "any",
          rules: [{ fieldId: "skills", operator: "contains", value: "garden" }],
        },
        validation: { minimum: 1, maximum: 10 },
      },
      {
        ...field,
        id: "followup",
        required: false,
        visibility: {
          mode: "all",
          rules: [{ fieldId: "skills", operator: "not_answered" }],
        },
      },
    ],
  });
  const visible = {
    interest: "Volunteer",
    available: true,
    skills: "Gardening",
    hours: "3",
  };
  expect(validateAnswers(definition, visible)).toEqual(visible);
  expect(
    visibleFields(definition.fields, {
      interest: "Visit",
      available: false,
      skills: "hidden stale value",
    }).map((item) => item.id),
  ).toEqual(["interest", "available", "hours"]);
  expect(() =>
    validateAnswers(definition, {
      interest: "Visit",
      available: false,
      skills: "hidden",
    }),
  ).toThrow();
  expect(() =>
    validateAnswers(definition, { ...visible, hours: "" }),
  ).toThrow();
  expect(() =>
    validateAnswers(definition, { ...visible, hours: "11" }),
  ).toThrow();
  expect(() =>
    validateAnswers(definition, { ...visible, skills: "x" }),
  ).toThrow();
  expect(
    formDefinitionSchema.safeParse({
      ...definition,
      fields: [...definition.fields].reverse(),
    }).success,
  ).toBe(false);
});

it("C03 applies published SEO defaults and filters directory categories without changing explicit selections", () => {
  const site = {
    ...defaultSiteSettings,
    navigation: [],
    header: null,
    footer: null,
    seo: {
      ...defaultSiteSeo,
      title: "Club default",
      description: "Published summary",
      indexable: false,
      socialImageId: randomUUID(),
    },
  };
  const metadata = publicMetadata({
    title: "Page title",
    description: "",
    canonical: "https://club.example.org/about",
    origin: "https://club.example.org",
    site,
  });
  expect(metadata.title).toBe("Page title");
  expect(metadata.description).toBe("Published summary");
  expect(metadata.robots).toMatchObject({ index: false });
  const profiles = [
    {
      id: randomUUID(),
      name: "Team",
      category: "team" as const,
      role: "Chair",
      description: "",
      website: "",
      logoId: null,
    },
    {
      id: randomUUID(),
      name: "Sponsor",
      category: "sponsor" as const,
      description: "",
      website: "",
      logoId: null,
    },
  ];
  expect(
    selectProfiles(
      { selectionMode: "category", category: "team", partnerIds: [] },
      profiles,
    ),
  ).toEqual([profiles[0]]);
  expect(
    selectProfiles(
      {
        selectionMode: "selected",
        category: "team",
        partnerIds: [profiles[1].id],
      },
      profiles,
    ),
  ).toEqual([profiles[1]]);
});
