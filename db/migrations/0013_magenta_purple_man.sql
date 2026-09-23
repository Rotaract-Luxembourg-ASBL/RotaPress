CREATE TABLE "club"."luma_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"credential" text,
	"calendar_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"check_state" text DEFAULT 'unchecked' NOT NULL,
	"check_code" text,
	"attempted_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	CONSTRAINT "luma_connection_organization" UNIQUE("organization_id"),
	CONSTRAINT "luma_connection_scope" UNIQUE("id","organization_id"),
	CONSTRAINT "luma_connection_version" CHECK ("club"."luma_connection"."version" > 0),
	CONSTRAINT "luma_connection_state" CHECK ("club"."luma_connection"."check_state" in ('unchecked', 'checking', 'verified', 'failed', 'disconnected')),
	CONSTRAINT "luma_connection_credential" CHECK (("club"."luma_connection"."check_state" = 'disconnected') = ("club"."luma_connection"."credential" is null)),
	CONSTRAINT "luma_connection_verified" CHECK ("club"."luma_connection"."check_state" <> 'verified' or ("club"."luma_connection"."calendar_id" is not null and "club"."luma_connection"."last_success_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "club"."luma_connection" ADD CONSTRAINT "luma_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;