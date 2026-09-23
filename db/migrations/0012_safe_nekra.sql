CREATE TABLE "club"."luma_availability" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "luma_availability_version" CHECK ("club"."luma_availability"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "club"."luma_event_link" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"draft_url" text NOT NULL,
	"published_url" text,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "luma_link_version" CHECK ("club"."luma_event_link"."version" > 0),
	CONSTRAINT "luma_link_publication" CHECK ("club"."luma_event_link"."published_at" is null or "club"."luma_event_link"."published_url" is not null),
	CONSTRAINT "luma_link_urls" CHECK ("club"."luma_event_link"."draft_url" ~ '^https://(luma[.]com|lu[.]ma)/[A-Za-z0-9_-]+$' and ("club"."luma_event_link"."published_url" is null or "club"."luma_event_link"."published_url" ~ '^https://(luma[.]com|lu[.]ma)/[A-Za-z0-9_-]+$'))
);
--> statement-breakpoint
ALTER TABLE "club"."registration_settings" DROP CONSTRAINT "registration_authority";--> statement-breakpoint
ALTER TABLE "club"."registration_settings" ADD COLUMN "external_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."luma_availability" ADD CONSTRAINT "luma_availability_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."luma_event_link" ADD CONSTRAINT "luma_event_link_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."registration_settings" ADD CONSTRAINT "registration_external_lock" CHECK (not "club"."registration_settings"."external_locked" or "club"."registration_settings"."authority" = 'luma');--> statement-breakpoint
ALTER TABLE "club"."registration_settings" ADD CONSTRAINT "registration_authority" CHECK (("club"."registration_settings"."authority" = 'none' and "club"."registration_settings"."form_id" is null and "club"."registration_settings"."open" = false) or ("club"."registration_settings"."authority" = 'native' and "club"."registration_settings"."form_id" is not null) or ("club"."registration_settings"."authority" = 'luma' and "club"."registration_settings"."form_id" is null and "club"."registration_settings"."capacity" is null));