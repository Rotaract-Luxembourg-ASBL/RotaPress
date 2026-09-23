import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";
import { user } from "./auth";
import { eventModule } from "./events";

export const cmsContent = club.table(
  "cms_content",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    kind: text("kind", {
      enum: ["page", "section", "header", "footer"],
    }).notNull(),
    eventId: uuid("event_id"),
    moduleKey: text("module_key", { enum: ["website", "gallery", "sponsors"] }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("cms_content_id_org").on(table.id, table.organizationId),
    foreignKey({
      columns: [table.eventId, table.moduleKey, table.organizationId],
      foreignColumns: [
        eventModule.eventId,
        eventModule.key,
        eventModule.organizationId,
      ],
    }),
    check(
      "cms_event_scope",
      sql`(${table.eventId} is null and ${table.moduleKey} is null) or (${table.eventId} is not null and ${table.moduleKey} is not null and ${table.kind} = 'page')`,
    ),
    index("cms_event_scope_index").on(table.eventId, table.moduleKey),
    uniqueIndex("cms_event_module_page")
      .on(table.eventId, table.moduleKey)
      .where(sql`${table.archivedAt} is null`),
    check(
      "cms_content_kind",
      sql`${table.kind} in ('page', 'section', 'header', 'footer')`,
    ),
  ],
);

export const cmsVariant = club.table(
  "cms_variant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentId: uuid("content_id").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    locale: text("locale", { enum: ["en", "fr", "lb"] }).notNull(),
    draftRevisionId: uuid("draft_revision_id"),
    publishedRevisionId: uuid("published_revision_id"),
    publicationVersion: integer("publication_version").notNull().default(0),
    publishedSlug: text("published_slug"),
    homeEverPublished: boolean("home_ever_published").notNull().default(false),
  },
  (table) => [
    unique("cms_variant_content_locale").on(table.contentId, table.locale),
    unique("cms_variant_schedule_scope").on(
      table.id,
      table.contentId,
      table.organizationId,
    ),
    unique("cms_variant_published_slug").on(
      table.organizationId,
      table.locale,
      table.publishedSlug,
    ),
    foreignKey({
      name: "cms_variant_content_org",
      columns: [table.contentId, table.organizationId],
      foreignColumns: [cmsContent.id, cmsContent.organizationId],
    }),
    check("cms_variant_locale", sql`${table.locale} in ('en', 'fr', 'lb')`),
    check(
      "cms_variant_slug_publication",
      sql`${table.publishedSlug} is null or ${table.publishedRevisionId} is not null`,
    ),
  ],
);

export const cmsRevision = club.table(
  "cms_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => cmsVariant.id),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    socialImageId: uuid("social_image_id"),
    data: jsonb("data").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("cms_revision_id_variant").on(table.id, table.variantId),
    index("cms_revision_variant_created").on(table.variantId, table.createdAt),
  ],
);

// Pointer foreign keys are installed in the reviewed SQL after both tables exist.
// Composite keys bind each draft/live pointer to its own locale variant.
export const cmsSite = club.table(
  "cms_site",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    locale: text("locale", { enum: ["en", "fr", "lb"] }).notNull(),
    version: integer("version").notNull().default(1),
    draft: jsonb("draft").notNull(),
    published: jsonb("published"),
    previousAppearance: jsonb("previous_appearance"),
    eventsDirectoryDraft: jsonb("events_directory_draft"),
    eventsDirectoryPublished: jsonb("events_directory_published"),
    eventsDirectoryVersion: integer("events_directory_version")
      .notNull()
      .default(0),
  },
  (table) => [
    unique("cms_site_organization_locale").on(
      table.organizationId,
      table.locale,
    ),
    check("cms_site_locale", sql`${table.locale} in ('en', 'fr', 'lb')`),
    check("cms_site_version", sql`${table.version} > 0`),
    check(
      "cms_site_events_directory_version",
      sql`${table.eventsDirectoryVersion} >= 0`,
    ),
  ],
);
