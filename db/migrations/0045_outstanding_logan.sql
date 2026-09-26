CREATE TABLE "club"."project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"archived" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_organization_slug" UNIQUE("organization_id","slug"),
	CONSTRAINT "project_version_positive" CHECK ("club"."project"."version" > 0),
	CONSTRAINT "project_slug" CHECK ("club"."project"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("club"."project"."slug") <= 180),
	CONSTRAINT "project_archived_private" CHECK (not "club"."project"."archived" or "club"."project"."published" is null)
);
--> statement-breakpoint
ALTER TABLE "club"."feature" DROP CONSTRAINT "feature_key";--> statement-breakpoint
ALTER TABLE "club"."project" ADD CONSTRAINT "project_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_organization_updated" ON "club"."project" USING btree ("organization_id","updated_at");--> statement-breakpoint
ALTER TABLE "club"."feature" ADD CONSTRAINT "feature_key" CHECK ("club"."feature"."key" in ('forms', 'events', 'calendar', 'projects'));