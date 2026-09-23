CREATE TABLE "club"."email_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_email" text NOT NULL,
	"reply_to" text DEFAULT '' NOT NULL,
	"smtp" jsonb,
	"secret" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "email_connection_provider" CHECK ("club"."email_connection"."provider" in ('smtp','resend')),
	CONSTRAINT "email_connection_version" CHECK ("club"."email_connection"."version" > 0),
	CONSTRAINT "email_connection_verified_default" CHECK (not "club"."email_connection"."is_default" or "club"."email_connection"."verified_at" is not null),
	CONSTRAINT "email_connection_settings" CHECK (("club"."email_connection"."provider" = 'smtp') = ("club"."email_connection"."smtp" is not null))
);
--> statement-breakpoint
CREATE TABLE "club"."email_template" (
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "email_template_organization_id_key_pk" PRIMARY KEY("organization_id","key"),
	CONSTRAINT "email_template_key" CHECK ("club"."email_template"."key" in ('verification','form_submission','calendar_update','calendar_reminder')),
	CONSTRAINT "email_template_version" CHECK ("club"."email_template"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "club"."calendar_subscription" ADD COLUMN "email_version" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."email_connection" ADD CONSTRAINT "email_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."email_template" ADD CONSTRAINT "email_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_connection_default" ON "club"."email_connection" USING btree ("organization_id") WHERE "club"."email_connection"."is_default";