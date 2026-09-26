import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { user } from "../../db/schema/auth";
import { membership } from "../../db/schema/club";
import {
  AuthorizationService,
  type TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { InstallationService } from "../../src/core/installation/InstallationService";
import { CmsService } from "../../src/features/cms";
import { FormService } from "../../src/features/forms/FormService";
import {
  defaultSiteSettings,
  type CmsData,
  type CmsDetail,
} from "../../src/features/cms/cms_schemas";
import { MediaService } from "../../src/features/media";
import type { Database } from "../../src/infrastructure/database/client";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import { appearanceChecks } from "./cms-appearance-cases";
import { sitePartChecks } from "./cms-site-part-cases";
import { publicationChecks } from "./cms-publication-cases";
import { partnerChecks } from "./cms-partner-cases";
import { sectionChecks } from "./cms-section-cases";
import { kitChecks } from "./cms-kit-cases";
import { websiteChecks } from "./cms-website-cases";
import { brandingChecks } from "./cms-branding-cases";
import { websitePublicationChecks } from "./cms-website-publication-cases";
import { eventDirectoryChecks } from "./event-directory-cases";
import { automationImportChecks } from "./automation-import-cases";
import { automationWebsiteChecks } from "./automation-website-cases";

let runtimePool: Pool;
let migrationPool: Pool;
let db: Database;
let authorization: AuthorizationService;
let cms: CmsService;
let media: MediaService;
const storageBase = path.resolve(".local/test-uploads");
const storageRoot = path.join(storageBase, `cms-${randomUUID()}`);
automationImportChecks(() => ({ db, cms, authorization, installedClub }));
automationWebsiteChecks(() => ({ db, cms, authorization, installedClub }));
sitePartChecks(() => ({ db, cms, media, actor, installedClub }));
kitChecks(() => ({ db, cms, media, authorization, actor, installedClub }));
websiteChecks(() => ({ db, cms, media, authorization, actor, installedClub }));
websitePublicationChecks(() => ({
  db,
  cms,
  media,
  authorization,
  actor,
  installedClub,
}));
brandingChecks(() => ({ cms, media, actor, installedClub }));
eventDirectoryChecks(() => ({
  db,
  cms,
  media,
  authorization,
  actor,
  installedClub,
}));
sectionChecks(() => ({ cms, media, installedClub }));
partnerChecks(() => ({ db, cms, media, authorization, actor, installedClub }));
publicationChecks(() => ({
  db,
  cms,
  media,
  authorization,
  actor,
  installedClub,
}));
appearanceChecks(() => ({
  db,
  cms,
  media,
  migrationPool,
  actor,
  installedClub,
}));

function requireTestDatabase(connection: string | undefined): string {
  if (!connection) throw new Error("Run setup before CMS checks.");
  const target = new URL(connection);
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.pathname !== "/rotapress_test"
  ) {
    throw new Error(
      "CMS checks require the explicit disposable local rotapress_test database.",
    );
  }
  return connection;
}

async function actor(label: string): Promise<TrustedActor> {
  const userId = randomUUID();
  const email = `${label}-${userId}@example.test`;
  await db.insert(user).values({
    id: userId,
    name: `Synthetic ${label}`,
    email,
    emailVerified: true,
  });
  return {
    userId,
    email,
    emailVerified: true,
    sessionId: randomUUID(),
    authenticatedAt: new Date(),
    authMethod: "email-otp",
  };
}

async function installedClub() {
  const owner = await actor("cms-owner");
  const claim = randomBytes(32).toString("hex");
  await migrationPool.query(
    "INSERT INTO club.installation (id, nominated_email, claim_hash, claim_expires_at) VALUES (1, $1, $2, $3)",
    [
      owner.email,
      createHash("sha256").update(claim).digest("hex"),
      new Date(Date.now() + 60_000),
    ],
  );
  await new InstallationService(db).complete(owner, {
    claim,
    name: "Synthetic CMS Club",
    tagline: "",
    description: "",
    locale: "en",
    timezone: "Europe/Luxembourg",
    accentColor: "#25636b",
  });
  return { owner, scope: await authorization.require(owner, "cms.edit") };
}

const richText = (text: string): CmsData => ({
  root: { props: {} },
  content: [{ type: "RichText", props: { id: "text-1", version: 1, text } }],
});
const action = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});
const save = (
  page: CmsDetail,
  data: CmsData,
  changes: { slug?: string; title?: string } = {},
) => ({
  ...action(page),
  title: page.draft.title,
  slug: page.draft.slug,
  description: "",
  socialImageId: null,
  data,
  ...changes,
});

beforeAll(async () => {
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  runtimePool = new Pool({
    connectionString: requireTestDatabase(env.DATABASE_URL),
    max: 5,
  });
  migrationPool = new Pool({
    connectionString: requireTestDatabase(env.TEST_MIGRATION_DATABASE_URL),
    max: 2,
  });
  db = drizzle(runtimePool, { schema });
  authorization = new AuthorizationService(db);
  media = new MediaService(
    db,
    authorization,
    new LocalStorageDriver(storageRoot),
  );
  cms = new CmsService(
    db,
    authorization,
    media,
    new FormService(db, authorization),
  );
});

beforeEach(async () => {
  await migrationPool.query(
    'TRUNCATE club.installation, club.organization, club.membership, club.audit_entry, club."user" CASCADE',
  );
});

afterAll(async () => {
  await Promise.all([runtimePool?.end(), migrationPool?.end()]);
  if (
    path.dirname(storageRoot) !== storageBase ||
    !/^cms-[0-9a-f-]{36}$/.test(path.basename(storageRoot))
  ) {
    throw new Error(
      "Refusing CMS fixture cleanup outside this run's disposable upload directory.",
    );
  }
  await rm(storageRoot, { recursive: true, force: true });
});

describe("C03 CMS publication, immutable revisions and current scope", () => {
  it("keeps drafts and missing languages private, rejects competing edits, and restores only to draft", async () => {
    const { owner, scope } = await installedClub();
    const member = await actor("member");
    await db.insert(membership).values({
      organizationId: scope.organizationId,
      userId: member.userId,
      role: "member",
      status: "approved",
    });
    let page = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Home",
      slug: "home",
    });
    expect(await cms.publicHome("en")).toEqual({
      configured: false,
      page: null,
    });
    await expect(cms.detail(member, page.id, "en")).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(cms.preview(member, page.id, "en")).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(
      cms.save(owner, {
        ...save(page, richText("draft")),
        organizationId: randomUUID(),
      }),
    ).rejects.toThrow();
    page = await cms.save(
      owner,
      save(page, richText("<p>First published version</p>")),
    );
    expect(await cms.publicPage("en", "home")).toBeNull();
    expect(await cms.publicSitemap()).toEqual([]);
    page = await cms.publish(owner, action(page));
    expect((await cms.publicHome("en")).configured).toBe(true);
    const firstRevision = page.draft.id;
    expect((await cms.publicPage("en", "home"))?.data).toEqual(
      richText("<p>First published version</p>"),
    );
    expect(await cms.publicPage("fr", "home")).toBeNull();
    const attempts = await Promise.allSettled([
      cms.save(
        owner,
        save(page, richText("<p>Second draft A</p>"), { slug: "new-home" }),
      ),
      cms.save(
        owner,
        save(page, richText("<p>Second draft B</p>"), { slug: "new-home" }),
      ),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
    expect((await cms.publicPage("en", "home"))?.title).toBe("Home");
    expect(await cms.publicPage("en", "new-home")).toBeNull();
    expect(
      (await cms.list(owner)).find((item) => item.id === page.id),
    ).toMatchObject({
      isHomepage: true,
      slug: "new-home",
    });
    page = await cms.detail(owner, page.id, "en");
    page = await cms.publish(owner, action(page));
    expect(await cms.publicPage("en", "home")).toBeNull();
    expect(
      (await cms.list(owner)).find((item) => item.id === page.id)?.isHomepage,
    ).toBe(false);
    const published = await cms.publicPage("en", "new-home");
    expect(published).not.toHaveProperty("createdBy");
    expect(published).not.toHaveProperty("publishedRevisionId");
    page = await cms.restore(owner, {
      ...action(page),
      revisionId: firstRevision,
    });
    expect(page.draft.id).not.toBe(firstRevision);
    expect(page.draft.data).toEqual(richText("<p>First published version</p>"));
    expect(await cms.publicPage("en", "new-home")).toEqual(published);
    const french = await cms.addLocale(owner, {
      id: page.id,
      locale: "fr",
      title: "Synthetic French fixture",
      slug: "accueil",
    });
    await cms.publish(owner, action(french));
    expect(await cms.publicPage("en", "accueil")).toBeNull();
    expect(await cms.publicPage("fr", "accueil")).not.toBeNull();
    await expect(
      runtimePool.query(
        "UPDATE club.cms_revision SET title = $1 WHERE id = $2",
        ["bad mutation", firstRevision],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const other = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Other",
      slug: "other",
    });
    expect(await cms.publicHome("en")).toEqual({
      configured: true,
      page: null,
    });
    await expect(
      runtimePool.query(
        "UPDATE club.cms_variant SET draft_revision_id = $1 WHERE content_id = $2",
        [firstRevision, other.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await cms.unpublish(owner, action(page));
    expect(await cms.publicPage("en", "new-home")).toBeNull();
    expect(await cms.publicPage("fr", "accueil")).not.toBeNull();
    await db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.id, scope.membershipId));
    await expect(
      cms.save(owner, save(page, richText("denied"))),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("publishes reusable sections and owned forms deliberately and keeps site settings behind publication", async () => {
    const { owner } = await installedClub();
    let section = await cms.create(owner, {
      kind: "section",
      locale: "en",
      title: "Shared",
      slug: "shared",
    });
    section = await cms.save(
      owner,
      save(section, richText("<p>Public section</p>")),
    );
    let page = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Page",
      slug: "page",
    });
    const shared: CmsData = {
      root: { props: {} },
      content: [
        {
          type: "SharedSection",
          props: { id: "section-1", version: 1, sectionId: section.id },
        },
      ],
    };
    page = await cms.save(owner, save(page, shared));
    await expect(cms.publish(owner, action(page))).rejects.toMatchObject({
      code: "SECTION_NOT_PUBLISHED",
    });
    await cms.publish(owner, action(section));
    await cms.publish(owner, action(page));
    expect((await cms.detail(owner, section.id, "en")).affectedPages).toEqual([
      { id: page.id, title: "Page", locale: "en", slug: "page" },
    ]);
    section = await cms.save(
      owner,
      save(section, richText("<p>Unpublished section edit</p>")),
    );
    expect((await cms.publicPage("en", "page"))?.sections[section.id]).toEqual(
      richText("<p>Public section</p>"),
    );
    await cms.publish(owner, action(section));
    expect((await cms.publicPage("en", "page"))?.sections[section.id]).toEqual(
      richText("<p>Unpublished section edit</p>"),
    );
    await expect(cms.unpublish(owner, action(section))).rejects.toMatchObject({
      code: "SECTION_IN_USE",
    });
    await expect(cms.save(owner, save(section, shared))).rejects.toMatchObject({
      code: "SECTION_NESTING_DISABLED",
    });
    let site = await cms.saveSite(owner, {
      locale: "en",
      expectedVersion: 0,
      settings: {
        ...defaultSiteSettings,
        homePageId: page.id,
        navigation: [{ pageId: page.id, label: "Read our page" }],
        footerText: "Published footer",
      },
    });
    expect((await cms.publicSite("en")).navigation).toEqual([]);
    site = await cms.publishSite(owner, {
      locale: "en",
      expectedVersion: site.version,
    });
    expect((await cms.publicSite("en")).navigation).toEqual([
      { label: "Read our page", href: "/pages/en/page" },
    ]);
    expect((await cms.publicHome("en")).page?.id).toBe(page.id);
    await cms.saveSite(owner, {
      locale: "en",
      expectedVersion: site.version,
      settings: { ...site.draft, footerText: "Private footer draft" },
    });
    expect((await cms.publicSite("en")).footerText).toBe("Published footer");
    await expect(
      cms.publishSite(owner, { locale: "en", expectedVersion: site.version }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const copy = await cms.duplicate(owner, {
      id: page.id,
      locale: "en",
      title: "Copy",
      slug: "copy",
    });
    expect(copy.publishedRevisionId).toBeNull();
    await cms.archive(owner, action(page));
    expect(await cms.publicPage("en", "page")).toBeNull();
    expect((await cms.publicSite("en")).navigation).toEqual([]);
    expect(await cms.publicHome("en")).toEqual({
      configured: true,
      page: null,
    });
    expect(await cms.publicSitemap()).toEqual([]);
    await cms.unpublish(owner, action(section));

    const forms = new FormService(db, authorization);
    const form = await forms.create(owner, { kind: "contact" });
    let formPage = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Contact form",
      slug: "contact-form",
    });
    const formData = (formId: string): CmsData => ({
      root: { props: {} },
      content: [{ type: "Form", props: { id: "contact", version: 1, formId } }],
    });
    await expect(
      cms.save(owner, save(formPage, formData(""))),
    ).rejects.toMatchObject({ code: "FORM_REFERENCE_REQUIRED" });
    await expect(
      cms.save(owner, save(formPage, formData(randomUUID()))),
    ).rejects.toMatchObject({ code: "FORM_NOT_FOUND" });
    // The installation is deliberately single-club. Exercise the same form
    // contract with a foreign organization rather than disabling that constraint.
    await expect(
      forms.assertOwnedForms(randomUUID(), [form.id], db),
    ).rejects.toMatchObject({ code: "FORM_NOT_FOUND" });
    formPage = await cms.save(owner, save(formPage, formData(form.id)));
    expect(formPage.draft.data).toEqual(formData(form.id));
    expect(await cms.publicPage("en", "contact-form")).toBeNull();
    await expect(cms.publish(owner, action(formPage))).rejects.toMatchObject({
      code: "FORM_NOT_PUBLISHED",
    });
    await forms.publish(owner, form.id, {
      expectedRevision: form.draftRevision,
    });
    await cms.publish(owner, action(formPage));
    expect((await cms.publicPage("en", "contact-form"))?.data).toEqual(
      formData(form.id),
    );
  });
});

describe("C04 CMS unsafe input and media publication boundary", () => {
  it("sanitizes rich text, rejects unknown block versions and unsafe URLs, and never publishes private images", async () => {
    const { owner } = await installedClub();
    let page = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Safety",
      slug: "safety",
    });
    page = await cms.save(
      owner,
      save(
        page,
        richText(
          '<p onclick="alert(1)">Safe <strong>text</strong></p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><iframe src="https://example.com"></iframe>',
        ),
      ),
    );
    const clean = page.draft.data.content[0];
    expect(clean.type).toBe("RichText");
    expect(JSON.stringify(clean)).not.toMatch(
      /onclick|onerror|script|iframe|javascript:/,
    );
    await expect(
      cms.save(owner, {
        ...save(page, richText("value")),
        data: {
          root: { props: {} },
          content: [
            {
              type: "RichText",
              props: { id: "x", version: 99, text: "future" },
            },
          ],
        },
      }),
    ).rejects.toThrow();
    await expect(
      cms.save(owner, {
        ...save(page, richText("value")),
        data: {
          root: { props: {} },
          content: [{ type: "Unknown", props: { id: "x", version: 1 } }],
        },
      }),
    ).rejects.toThrow();
    for (const href of [
      "javascript:alert(1)",
      "//example.com",
      "\\\\example.com",
      "https://user:password@example.com",
    ]) {
      await expect(
        cms.save(
          owner,
          save(page, {
            root: { props: {} },
            content: [
              {
                type: "CallToAction",
                props: {
                  id: "cta",
                  version: 1,
                  title: "x",
                  text: "",
                  label: "x",
                  href,
                },
              },
            ],
          }),
        ),
      ).rejects.toThrow();
      await expect(
        cms.save(
          owner,
          save(page, {
            root: { props: {} },
            content: [
              {
                type: "Image",
                props: {
                  id: "image-link",
                  version: 1,
                  assetId: "",
                  alt: "",
                  caption: "",
                  href,
                },
              },
            ],
          }),
        ),
      ).rejects.toThrow();
    }
    const imageBytes = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#25636b" },
    })
      .png()
      .toBuffer();
    let image = await media.upload(owner, {
      filename: "synthetic.png",
      bytes: imageBytes,
      title: "Synthetic image",
    });
    const heroData: CmsData = {
      root: { props: {} },
      content: [
        {
          type: "Hero",
          props: {
            id: "hero-image",
            version: 1,
            title: "A club story",
            body: "",
            buttonLabel: "",
            buttonHref: "",
            assetId: image.id,
            imageAlt: "Synthetic hero",
            imagePosition: "left",
          },
        },
      ],
    };
    await expect(
      cms.save(
        owner,
        save(page, {
          ...heroData,
          content: [
            {
              type: "Hero",
              props: {
                id: "hero-image",
                version: 1,
                title: "A club story",
                body: "",
                buttonLabel: "",
                buttonHref: "",
                assetId: randomUUID(),
              },
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "MEDIA_SCOPE_INVALID" });
    page = await cms.save(owner, save(page, heroData));
    await expect(cms.publish(owner, action(page))).rejects.toMatchObject({
      code: "MEDIA_NOT_PUBLIC",
    });
    const privateImageLayouts: CmsData[] = [
      {
        root: { props: {} },
        content: [
          {
            type: "Cover",
            props: {
              id: "cover-image",
              version: 1,
              title: "Cover image",
              body: "",
              buttonLabel: "",
              buttonHref: "",
              assetId: image.id,
              tone: "sage",
              padding: "medium",
              alignment: "left",
            },
          },
        ],
      },
      {
        root: { props: {} },
        content: [
          {
            type: "ImageSlider",
            props: {
              id: "slider-image",
              version: 1,
              items: [{ assetId: image.id, alt: "Private slide", caption: "" }],
            },
          },
        ],
      },
    ];
    for (const data of privateImageLayouts) {
      page = await cms.save(owner, save(page, data));
      await expect(cms.publish(owner, action(page))).rejects.toMatchObject({
        code: "MEDIA_NOT_PUBLIC",
      });
    }
    const imageData: CmsData = {
      root: { props: {} },
      content: [
        {
          type: "Image",
          props: {
            id: "image",
            version: 1,
            assetId: image.id,
            alt: "Synthetic image",
            caption: "",
            alignment: "right",
            width: "medium",
            widthPx: 423,
            focalX: 25,
            focalY: 70,
            flipHorizontal: true,
            flipVertical: false,
            aspectRatio: "square",
            fit: "contain",
            corners: "round",
            href: "/membership",
          },
        },
      ],
    };
    for (const invalid of [
      { widthPx: -1 },
      { widthPx: 2401 },
      { widthPx: 40.5 },
      { focalX: -1 },
      { focalY: 101 },
      { flipHorizontal: "true" },
    ]) {
      await expect(
        cms.save(owner, {
          ...save(page, imageData),
          data: {
            root: { props: {} },
            content: [
              {
                type: "Image",
                props: { ...imageData.content[0].props, ...invalid },
              },
            ],
          },
        }),
      ).rejects.toThrow();
    }
    await expect(
      cms.save(
        owner,
        save(page, {
          ...imageData,
          content: [
            {
              type: "Image",
              props: {
                id: "image",
                version: 1,
                assetId: randomUUID(),
                alt: "",
                caption: "",
              },
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "MEDIA_SCOPE_INVALID" });
    page = await cms.save(owner, save(page, imageData));
    await expect(cms.publish(owner, action(page))).rejects.toMatchObject({
      code: "MEDIA_NOT_PUBLIC",
    });
    expect(await cms.publicPage("en", "safety")).toBeNull();
    image = await media.update(owner, {
      id: image.id,
      title: image.title,
      alt: image.alt,
      caption: image.caption,
      tags: image.tags,
      collection: image.collection,
      visibility: "public",
    });
    page = await cms.publish(owner, action(page));
    expect((await cms.publicPage("en", "safety"))?.data).toEqual(imageData);
    await expect(
      media.update(owner, {
        id: image.id,
        title: image.title,
        alt: image.alt,
        caption: image.caption,
        tags: image.tags,
        collection: image.collection,
        visibility: "private",
      }),
    ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
    await cms.unpublish(owner, action(page));
    await expect(media.delete(owner, image.id)).rejects.toMatchObject({
      code: "MEDIA_REFERENCED",
    });
    await cms.publish(owner, action(page));
    // A malformed imported live revision fails closed on read and republication.
    await migrationPool.query(
      "UPDATE club.cms_revision SET data = $1 WHERE id = $2",
      [
        JSON.stringify({
          root: { props: {} },
          content: [{ type: "Unknown", props: { id: "bad", version: 1 } }],
        }),
        page.draft.id,
      ],
    );
    await expect(cms.publish(owner, action(page))).rejects.toThrow();
    expect(await cms.publicPage("en", "safety")).toBeNull();
  });
});
