CREATE TABLE "club"."automation_availability" (
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "automation_availability_organization_id_kind_pk" PRIMARY KEY("organization_id","kind"),
	CONSTRAINT "automation_availability_kind" CHECK ("club"."automation_availability"."kind" in ('rest', 'mcp')),
	CONSTRAINT "automation_availability_version" CHECK ("club"."automation_availability"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "club"."automation_availability" ADD CONSTRAINT "automation_availability_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;