CREATE TABLE "club"."cms_editor_checkpoint" (
	"actor_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"base_revision_id" uuid NOT NULL,
	"document" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_editor_checkpoint_actor_id_variant_id_pk" PRIMARY KEY("actor_id","variant_id"),
	CONSTRAINT "cms_editor_checkpoint_version" CHECK ("club"."cms_editor_checkpoint"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "club"."cms_page_placement" (
	"content_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"parent_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "cms_page_not_own_parent" CHECK ("club"."cms_page_placement"."parent_id" is null or "club"."cms_page_placement"."parent_id" <> "club"."cms_page_placement"."content_id"),
	CONSTRAINT "cms_page_placement_version" CHECK ("club"."cms_page_placement"."version" > 0 and "club"."cms_page_placement"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "club"."media_album" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"draft_revision_id" uuid,
	"published_revision_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_album_scope" UNIQUE("id","organization_id"),
	CONSTRAINT "media_album_version_positive" CHECK ("club"."media_album"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "club"."media_album_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_album_revision_scope" UNIQUE("id","album_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "club"."media_album_usage" (
	"organization_id" uuid NOT NULL,
	"owner_key" text NOT NULL,
	"album_id" uuid NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	CONSTRAINT "media_album_usage_organization_id_owner_key_album_id_pk" PRIMARY KEY("organization_id","owner_key","album_id")
);
--> statement-breakpoint
CREATE TABLE "club"."media_upload_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"input" jsonb NOT NULL,
	"size" integer NOT NULL,
	"chunks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"asset_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_upload_request" UNIQUE("organization_id","request_id"),
	CONSTRAINT "media_upload_size" CHECK ("club"."media_upload_session"."size" > 0 and "club"."media_upload_session"."size" <= 524288000),
	CONSTRAINT "media_upload_hash" CHECK ("club"."media_upload_session"."input_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "media_upload_status" CHECK ("club"."media_upload_session"."status" in ('uploading', 'complete', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "club"."media_asset" DROP CONSTRAINT "media_asset_mime";--> statement-breakpoint
ALTER TABLE "club"."media_asset" DROP CONSTRAINT "media_asset_size";--> statement-breakpoint
ALTER TABLE "club"."media_asset" DROP CONSTRAINT "media_asset_pixels";--> statement-breakpoint
ALTER TABLE "club"."media_asset" ALTER COLUMN "width" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."media_asset" ALTER COLUMN "height" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."membership" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."form_submission" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."media_asset" ADD COLUMN "kind" text DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."cms_editor_checkpoint" ADD CONSTRAINT "cms_editor_checkpoint_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_editor_checkpoint" ADD CONSTRAINT "cms_editor_checkpoint_variant_id_content_id_organization_id_cms_variant_id_content_id_organization_id_fk" FOREIGN KEY ("variant_id","content_id","organization_id") REFERENCES "club"."cms_variant"("id","content_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_editor_checkpoint" ADD CONSTRAINT "cms_editor_checkpoint_base_revision_id_variant_id_cms_revision_id_variant_id_fk" FOREIGN KEY ("base_revision_id","variant_id") REFERENCES "club"."cms_revision"("id","variant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_page_placement" ADD CONSTRAINT "cms_page_placement_content_id_organization_id_cms_content_id_organization_id_fk" FOREIGN KEY ("content_id","organization_id") REFERENCES "club"."cms_content"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_page_placement" ADD CONSTRAINT "cms_page_placement_parent_id_organization_id_cms_content_id_organization_id_fk" FOREIGN KEY ("parent_id","organization_id") REFERENCES "club"."cms_content"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."media_album" ADD CONSTRAINT "media_album_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."media_album_revision" ADD CONSTRAINT "media_album_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."media_album_revision" ADD CONSTRAINT "media_album_revision_album_id_organization_id_media_album_id_organization_id_fk" FOREIGN KEY ("album_id","organization_id") REFERENCES "club"."media_album"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."media_album_usage" ADD CONSTRAINT "media_album_usage_album_id_organization_id_media_album_id_organization_id_fk" FOREIGN KEY ("album_id","organization_id") REFERENCES "club"."media_album"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."media_upload_session" ADD CONSTRAINT "media_upload_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."media_upload_session" ADD CONSTRAINT "media_upload_session_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_editor_checkpoint_content" ON "club"."cms_editor_checkpoint" USING btree ("organization_id","content_id");--> statement-breakpoint
CREATE INDEX "cms_page_placement_parent" ON "club"."cms_page_placement" USING btree ("organization_id","parent_id","position");--> statement-breakpoint
CREATE INDEX "media_album_updated" ON "club"."media_album" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "media_album_revision_created" ON "club"."media_album_revision" USING btree ("album_id","created_at");--> statement-breakpoint
CREATE INDEX "media_album_usage_album" ON "club"."media_album_usage" USING btree ("organization_id","album_id");--> statement-breakpoint
CREATE INDEX "media_upload_expiry" ON "club"."media_upload_session" USING btree ("expires_at");--> statement-breakpoint
-- Scoped circular pointers follow revision creation, as in CMS publication.
ALTER TABLE club.media_album ADD CONSTRAINT media_album_draft_revision_scope FOREIGN KEY (draft_revision_id,id,organization_id) REFERENCES club.media_album_revision(id,album_id,organization_id);
--> statement-breakpoint
ALTER TABLE club.media_album ADD CONSTRAINT media_album_published_revision_scope FOREIGN KEY (published_revision_id,id,organization_id) REFERENCES club.media_album_revision(id,album_id,organization_id);
--> statement-breakpoint
ALTER TABLE "club"."membership" ADD CONSTRAINT "membership_version" CHECK ("club"."membership"."version" > 0);--> statement-breakpoint
ALTER TABLE "club"."form_submission" ADD CONSTRAINT "form_submission_version_positive" CHECK ("club"."form_submission"."version" > 0);--> statement-breakpoint
ALTER TABLE "club"."media_asset" ADD CONSTRAINT "media_asset_mime" CHECK (("club"."media_asset"."kind" = 'image' and "club"."media_asset"."mime_type" = 'image/webp') or ("club"."media_asset"."kind" = 'document' and "club"."media_asset"."mime_type" = 'application/pdf') or ("club"."media_asset"."kind" = 'audio' and "club"."media_asset"."mime_type" in ('audio/mpeg', 'audio/mp4')) or ("club"."media_asset"."kind" = 'video' and "club"."media_asset"."mime_type" in ('video/mp4', 'video/webm')));--> statement-breakpoint
ALTER TABLE "club"."media_asset" ADD CONSTRAINT "media_asset_size" CHECK ("club"."media_asset"."size" > 0 and "club"."media_asset"."size" <= case "club"."media_asset"."kind" when 'image' then 5242880 when 'document' then 26214400 when 'audio' then 104857600 when 'video' then 524288000 else 0 end);--> statement-breakpoint
ALTER TABLE "club"."media_asset" ADD CONSTRAINT "media_asset_pixels" CHECK (("club"."media_asset"."kind" in ('image', 'video') and "club"."media_asset"."width" is not null and "club"."media_asset"."height" is not null and "club"."media_asset"."width" > 0 and "club"."media_asset"."height" > 0 and "club"."media_asset"."width"::bigint * "club"."media_asset"."height" <= 20000000) or ("club"."media_asset"."kind" in ('document', 'audio') and "club"."media_asset"."width" is null and "club"."media_asset"."height" is null));
