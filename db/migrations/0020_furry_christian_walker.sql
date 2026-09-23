CREATE TABLE "club"."feature" (
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"version" integer NOT NULL,
	"last_disabled_at" timestamp with time zone,
	CONSTRAINT "feature_organization_id_key_pk" PRIMARY KEY("organization_id","key"),
	CONSTRAINT "feature_key" CHECK ("club"."feature"."key" in ('forms', 'events')),
	CONSTRAINT "feature_version" CHECK ("club"."feature"."version" > 0),
	CONSTRAINT "feature_disabled_at" CHECK ("club"."feature"."enabled" or "club"."feature"."last_disabled_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "club"."form_notification" ADD COLUMN "reviewed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."feature" ADD CONSTRAINT "feature_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;