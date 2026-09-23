CREATE TABLE "club"."event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"venue" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_scope" UNIQUE("id","organization_id"),
	CONSTRAINT "event_visibility" CHECK ("club"."event"."visibility" in ('public', 'unlisted', 'private')),
	CONSTRAINT "event_version_positive" CHECK ("club"."event"."version" > 0),
	CONSTRAINT "event_date_order" CHECK ("club"."event"."ends_at" is null or "club"."event"."ends_at" > "club"."event"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "club"."event_manager" (
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "event_manager_event_id_pk" PRIMARY KEY("event_id")
);
--> statement-breakpoint
ALTER TABLE "club"."event" ADD CONSTRAINT "event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event" ADD CONSTRAINT "event_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_manager" ADD CONSTRAINT "event_manager_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_manager" ADD CONSTRAINT "event_manager_organization_id_user_id_membership_organization_id_user_id_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "club"."membership"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_organization_start" ON "club"."event" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "event_manager_user" ON "club"."event_manager" USING btree ("organization_id","user_id");