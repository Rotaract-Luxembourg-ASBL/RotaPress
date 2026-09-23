CREATE TABLE "club"."calendar_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"endpoint" text,
	"host" text,
	"draft" text NOT NULL,
	"published" text,
	"version" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"automatic" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"session_id" text NOT NULL,
	"checked_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	CONSTRAINT "calendar_source_version" CHECK ("club"."calendar_source"."version" > 0),
	CONSTRAINT "calendar_source_size" CHECK (octet_length("club"."calendar_source"."draft") <= 524288 and ("club"."calendar_source"."published" is null or octet_length("club"."calendar_source"."published") <= 524288))
);
--> statement-breakpoint
ALTER TABLE "club"."calendar_source" ADD CONSTRAINT "calendar_source_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."calendar_source" ADD CONSTRAINT "calendar_source_calendar_id_organization_id_calendar_id_organization_id_fk" FOREIGN KEY ("calendar_id","organization_id") REFERENCES "club"."calendar"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_source_calendar" ON "club"."calendar_source" USING btree ("calendar_id","organization_id");--> statement-breakpoint
CREATE INDEX "calendar_source_org" ON "club"."calendar_source" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "calendar_source_actor" ON "club"."calendar_source" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "calendar_source_queue" ON "club"."calendar_source" USING btree ("enabled","next_sync_at");