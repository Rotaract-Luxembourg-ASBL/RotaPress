CREATE TABLE "club"."event_module" (
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "event_module_event_id_key_pk" PRIMARY KEY("event_id","key"),
	CONSTRAINT "event_module_scope" UNIQUE("event_id","key","organization_id"),
	CONSTRAINT "event_module_key" CHECK ("club"."event_module"."key" in ('website', 'gallery', 'sponsors')),
	CONSTRAINT "event_module_state" CHECK ("club"."event_module"."state" in ('enabled', 'disabled', 'suspended'))
);
--> statement-breakpoint
ALTER TABLE "club"."cms_content" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "club"."cms_content" ADD COLUMN "module_key" text;--> statement-breakpoint
ALTER TABLE "club"."event" ADD COLUMN "published" jsonb;--> statement-breakpoint
ALTER TABLE "club"."event" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club"."event_module" ADD CONSTRAINT "event_module_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_content" ADD CONSTRAINT "cms_content_event_id_module_key_organization_id_event_module_event_id_key_organization_id_fk" FOREIGN KEY ("event_id","module_key","organization_id") REFERENCES "club"."event_module"("event_id","key","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_event_scope_index" ON "club"."cms_content" USING btree ("event_id","module_key");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_event_module_page" ON "club"."cms_content" USING btree ("event_id","module_key") WHERE "club"."cms_content"."archived_at" is null;--> statement-breakpoint
ALTER TABLE "club"."cms_content" ADD CONSTRAINT "cms_event_scope" CHECK (("club"."cms_content"."event_id" is null and "club"."cms_content"."module_key" is null) or ("club"."cms_content"."event_id" is not null and "club"."cms_content"."module_key" is not null and "club"."cms_content"."kind" = 'page'));