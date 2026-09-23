CREATE TABLE "club"."cms_preview" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club"."event_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_version" integer NOT NULL,
	"action" text NOT NULL,
	"fields" jsonb NOT NULL,
	"pages" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_revision_action" CHECK ("club"."event_revision"."action" in ('created','saved','published','restored','baseline'))
);
--> statement-breakpoint
ALTER TABLE "club"."event" ADD COLUMN "slug" text DEFAULT 'event-' || gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."event" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Existing IDs and publication stay intact. The readable alias is stable after migration.
UPDATE "club"."event" SET "slug" = 'event-' || "id"::text;
--> statement-breakpoint
-- Preserve a truthful baseline of existing drafts; earlier edits cannot be reconstructed.
INSERT INTO "club"."event_revision" ("event_id", "organization_id", "event_version", "action", "fields", "pages", "created_by")
SELECT e."id", e."organization_id", e."version", 'baseline', jsonb_build_object(
  'title', e."title", 'description', e."description", 'startsAt', to_char(e."starts_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'endsAt', CASE WHEN e."ends_at" IS NULL THEN NULL ELSE to_char(e."ends_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
  'timezone', e."timezone", 'venue', e."venue", 'visibility', e."visibility"
), COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c."id", 'locale', v."locale", 'revisionId', v."draft_revision_id"))
  FROM "club"."cms_content" c JOIN "club"."cms_variant" v ON v."content_id" = c."id"
  WHERE c."event_id" = e."id" AND c."archived_at" IS NULL AND v."draft_revision_id" IS NOT NULL), '[]'::jsonb), e."created_by"
FROM "club"."event" e;
--> statement-breakpoint
ALTER TABLE "club"."cms_preview" ADD CONSTRAINT "cms_preview_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_preview" ADD CONSTRAINT "cms_preview_content_id_organization_id_cms_content_id_organization_id_fk" FOREIGN KEY ("content_id","organization_id") REFERENCES "club"."cms_content"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_revision" ADD CONSTRAINT "event_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_revision" ADD CONSTRAINT "event_revision_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_preview_expiry" ON "club"."cms_preview" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "cms_preview_session" ON "club"."cms_preview" USING btree ("user_id","session_id");--> statement-breakpoint
CREATE INDEX "event_revision_history" ON "club"."event_revision" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "event_one_featured" ON "club"."event" USING btree ("organization_id") WHERE "club"."event"."featured" = true;--> statement-breakpoint
ALTER TABLE "club"."event" ADD CONSTRAINT "event_slug_scope" UNIQUE("organization_id","slug");--> statement-breakpoint
ALTER TABLE "club"."event" ADD CONSTRAINT "event_slug_format" CHECK ("club"."event"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("club"."event"."slug") <= 160);
