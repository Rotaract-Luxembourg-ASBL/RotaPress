CREATE TABLE "club"."email_template_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"calendar_id" uuid,
	"form_id" uuid,
	"key" text NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "email_calendar_template" UNIQUE("calendar_id","key"),
	CONSTRAINT "email_form_template" UNIQUE("form_id","key"),
	CONSTRAINT "email_template_override_scope" CHECK (("club"."email_template_override"."calendar_id" is not null and "club"."email_template_override"."form_id" is null and "club"."email_template_override"."key" in ('calendar_update','calendar_reminder')) or ("club"."email_template_override"."form_id" is not null and "club"."email_template_override"."calendar_id" is null and "club"."email_template_override"."key" = 'form_submission')),
	CONSTRAINT "email_template_override_version" CHECK ("club"."email_template_override"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "club"."email_template_override" ADD CONSTRAINT "email_template_override_calendar_id_organization_id_calendar_id_organization_id_fk" FOREIGN KEY ("calendar_id","organization_id") REFERENCES "club"."calendar"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."email_template_override" ADD CONSTRAINT "email_template_override_form_id_organization_id_form_id_organization_id_fk" FOREIGN KEY ("form_id","organization_id") REFERENCES "club"."form"("id","organization_id") ON DELETE cascade ON UPDATE no action;