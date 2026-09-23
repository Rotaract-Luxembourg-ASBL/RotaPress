CREATE TABLE "club"."form" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"draft_revision" integer DEFAULT 1 NOT NULL,
	"draft" jsonb NOT NULL,
	"published_version_id" uuid,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retention_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_id_org" UNIQUE("id","organization_id"),
	CONSTRAINT "form_kind" CHECK ("club"."form"."kind" in ('contact', 'membership')),
	CONSTRAINT "form_draft_revision" CHECK ("club"."form"."draft_revision" > 0),
	CONSTRAINT "form_retention_days" CHECK ("club"."form"."retention_days" is null or "club"."form"."retention_days" between 1 and 36500)
);
--> statement-breakpoint
CREATE TABLE "club"."form_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"last_error_code" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_notification_submission_recipient" UNIQUE("submission_id","recipient"),
	CONSTRAINT "form_notification_status" CHECK ("club"."form_notification"."status" in ('pending', 'processing', 'sent', 'failed')),
	CONSTRAINT "form_notification_attempts" CHECK ("club"."form_notification"."attempts" >= 0),
	CONSTRAINT "form_notification_lease" CHECK (("club"."form_notification"."status" = 'processing') = ("club"."form_notification"."lease_token" is not null and "club"."form_notification"."lease_expires_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "club"."form_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"answers" jsonb NOT NULL,
	"submitted_by_user_id" text,
	"membership_status" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_submission_id_form_org" UNIQUE("id","form_id","organization_id"),
	CONSTRAINT "form_submission_request" UNIQUE("form_id","request_id"),
	CONSTRAINT "form_submission_status" CHECK ("club"."form_submission"."status" in ('new', 'reviewing', 'closed')),
	CONSTRAINT "form_submission_membership" CHECK ("club"."form_submission"."membership_status" is null or ("club"."form_submission"."membership_status" in ('pending', 'approved') and "club"."form_submission"."submitted_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "club"."form_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_version_id_form_org" UNIQUE("id","form_id","organization_id"),
	CONSTRAINT "form_version_form_number" UNIQUE("form_id","number"),
	CONSTRAINT "form_version_number" CHECK ("club"."form_version"."number" > 0)
);
--> statement-breakpoint
ALTER TABLE "club"."form" ADD CONSTRAINT "form_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."form_notification" ADD CONSTRAINT "form_notification_submission_scope" FOREIGN KEY ("submission_id","form_id","organization_id") REFERENCES "club"."form_submission"("id","form_id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."form_submission" ADD CONSTRAINT "form_submission_submitted_by_user_id_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."form_submission" ADD CONSTRAINT "form_submission_version_scope" FOREIGN KEY ("version_id","form_id","organization_id") REFERENCES "club"."form_version"("id","form_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."form_version" ADD CONSTRAINT "form_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."form_version" ADD CONSTRAINT "form_version_form_scope" FOREIGN KEY ("form_id","organization_id") REFERENCES "club"."form"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_notification_pending" ON "club"."form_notification" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "form_submission_form_created" ON "club"."form_submission" USING btree ("form_id","created_at");
--> statement-breakpoint
-- A published pointer must identify a version of this exact form and club.
ALTER TABLE "club"."form" ADD CONSTRAINT "form_published_version_scope"
  FOREIGN KEY ("published_version_id", "id", "organization_id")
  REFERENCES "club"."form_version" ("id", "form_id", "organization_id");
