import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { club } from "./club";
import { user } from "./auth";
import { cmsContent, cmsRevision, cmsVariant } from "./cms";

/** Organization only: moving a page never changes its public address. */
export const cmsPagePlacement = club.table(
  "cms_page_placement",
  {
    contentId: uuid("content_id").primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    parentId: uuid("parent_id"),
    position: integer("position").notNull().default(0),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    foreignKey({
      columns: [t.contentId, t.organizationId],
      foreignColumns: [cmsContent.id, cmsContent.organizationId],
    }),
    foreignKey({
      columns: [t.parentId, t.organizationId],
      foreignColumns: [cmsContent.id, cmsContent.organizationId],
    }),
    check(
      "cms_page_not_own_parent",
      sql`${t.parentId} is null or ${t.parentId} <> ${t.contentId}`,
    ),
    check(
      "cms_page_placement_version",
      sql`${t.version} > 0 and ${t.position} >= 0`,
    ),
    index("cms_page_placement_parent").on(
      t.organizationId,
      t.parentId,
      t.position,
    ),
  ],
);

/** Private recovery checkpoints do not publish or append immutable revisions. */
export const cmsEditorCheckpoint = club.table(
  "cms_editor_checkpoint",
  {
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    organizationId: uuid("organization_id").notNull(),
    contentId: uuid("content_id").notNull(),
    variantId: uuid("variant_id").notNull(),
    baseRevisionId: uuid("base_revision_id").notNull(),
    document: jsonb("document").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.actorId, t.variantId] }),
    foreignKey({
      columns: [t.variantId, t.contentId, t.organizationId],
      foreignColumns: [
        cmsVariant.id,
        cmsVariant.contentId,
        cmsVariant.organizationId,
      ],
    }),
    foreignKey({
      columns: [t.baseRevisionId, t.variantId],
      foreignColumns: [cmsRevision.id, cmsRevision.variantId],
    }),
    check("cms_editor_checkpoint_version", sql`${t.version} > 0`),
    index("cms_editor_checkpoint_content").on(t.organizationId, t.contentId),
  ],
);
