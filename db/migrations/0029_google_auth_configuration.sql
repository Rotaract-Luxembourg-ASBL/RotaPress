CREATE TABLE "club"."google_auth_configuration" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"client_id" text,
	"client_secret" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_auth_version" CHECK ("club"."google_auth_configuration"."version" > 0),
	CONSTRAINT "google_auth_credentials" CHECK (("club"."google_auth_configuration"."client_id" is null) = ("club"."google_auth_configuration"."client_secret" is null)),
	CONSTRAINT "google_auth_enabled" CHECK (not "club"."google_auth_configuration"."enabled" or "club"."google_auth_configuration"."client_secret" is not null)
);
--> statement-breakpoint
ALTER TABLE "club"."session" ADD COLUMN "auth_provider_version" text;--> statement-breakpoint
ALTER TABLE "club"."google_auth_configuration" ADD CONSTRAINT "google_auth_configuration_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE cascade ON UPDATE no action;