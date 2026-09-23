CREATE TABLE "club"."cms_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_content_id_org" UNIQUE("id","organization_id"),
	CONSTRAINT "cms_content_kind" CHECK ("club"."cms_content"."kind" in ('page', 'section'))
);
--> statement-breakpoint
CREATE TABLE "club"."cms_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"social_image_id" uuid,
	"data" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_revision_id_variant" UNIQUE("id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "club"."cms_site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	CONSTRAINT "cms_site_organization_locale" UNIQUE("organization_id","locale"),
	CONSTRAINT "cms_site_locale" CHECK ("club"."cms_site"."locale" in ('en', 'fr', 'lb')),
	CONSTRAINT "cms_site_version" CHECK ("club"."cms_site"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "club"."cms_variant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"draft_revision_id" uuid,
	"published_revision_id" uuid,
	"published_slug" text,
	CONSTRAINT "cms_variant_content_locale" UNIQUE("content_id","locale"),
	CONSTRAINT "cms_variant_published_slug" UNIQUE("organization_id","locale","published_slug"),
	CONSTRAINT "cms_variant_locale" CHECK ("club"."cms_variant"."locale" in ('en', 'fr', 'lb')),
	CONSTRAINT "cms_variant_slug_publication" CHECK ("club"."cms_variant"."published_slug" is null or "club"."cms_variant"."published_revision_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "club"."media_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"storage_driver" text DEFAULT 'local' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"uploader_id" text NOT NULL,
	"mime_type" text DEFAULT 'image/webp' NOT NULL,
	"original_name" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"collection" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_asset_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_asset_scope" UNIQUE("id","organization_id"),
	CONSTRAINT "media_asset_visibility" CHECK ("club"."media_asset"."visibility" in ('private', 'public')),
	CONSTRAINT "media_asset_driver" CHECK ("club"."media_asset"."storage_driver" = 'local'),
	CONSTRAINT "media_asset_mime" CHECK ("club"."media_asset"."mime_type" = 'image/webp'),
	CONSTRAINT "media_asset_size" CHECK ("club"."media_asset"."size" > 0 and "club"."media_asset"."size" <= 5242880),
	CONSTRAINT "media_asset_pixels" CHECK ("club"."media_asset"."width" > 0 and "club"."media_asset"."height" > 0 and "club"."media_asset"."width"::bigint * "club"."media_asset"."height" <= 20000000)
);
--> statement-breakpoint
CREATE TABLE "club"."media_usage" (
	"organization_id" uuid NOT NULL,
	"owner_key" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	CONSTRAINT "media_usage_organization_id_owner_key_asset_id_pk" PRIMARY KEY("organization_id","owner_key","asset_id")
);
--> statement-breakpoint
ALTER TABLE "club"."cms_content" ADD CONSTRAINT "cms_content_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_revision" ADD CONSTRAINT "cms_revision_variant_id_cms_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "club"."cms_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_revision" ADD CONSTRAINT "cms_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_site" ADD CONSTRAINT "cms_site_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_variant" ADD CONSTRAINT "cms_variant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_variant" ADD CONSTRAINT "cms_variant_content_org" FOREIGN KEY ("content_id","organization_id") REFERENCES "club"."cms_content"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."media_asset" ADD CONSTRAINT "media_asset_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."media_asset" ADD CONSTRAINT "media_asset_uploader_id_user_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."media_usage" ADD CONSTRAINT "media_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."media_usage" ADD CONSTRAINT "media_usage_asset_id_organization_id_media_asset_id_organization_id_fk" FOREIGN KEY ("asset_id","organization_id") REFERENCES "club"."media_asset"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_revision_variant_created" ON "club"."cms_revision" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE INDEX "media_asset_organization_created" ON "club"."media_asset" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "media_usage_asset" ON "club"."media_usage" USING btree ("organization_id","asset_id");
--> statement-breakpoint
-- Each pointer is constrained to a revision of its own locale variant.
ALTER TABLE "club"."cms_variant" ADD CONSTRAINT "cms_variant_draft_revision_scope"
  FOREIGN KEY ("draft_revision_id", "id") REFERENCES "club"."cms_revision" ("id", "variant_id");
--> statement-breakpoint
ALTER TABLE "club"."cms_variant" ADD CONSTRAINT "cms_variant_published_revision_scope"
  FOREIGN KEY ("published_revision_id", "id") REFERENCES "club"."cms_revision" ("id", "variant_id");
