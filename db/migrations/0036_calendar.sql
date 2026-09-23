CREATE TABLE "club"."calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_scope" UNIQUE("id","organization_id"),
	CONSTRAINT "calendar_version" CHECK ("club"."calendar"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "club"."calendar_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "calendar_notice_key" UNIQUE("subscription_id","key"),
	CONSTRAINT "calendar_notice_kind" CHECK ("club"."calendar_notification"."kind" in ('update','reminder')),
	CONSTRAINT "calendar_notice_status" CHECK ("club"."calendar_notification"."status" in ('pending','processing','sent','cancelled','failed')),
	CONSTRAINT "calendar_notice_attempts" CHECK ("club"."calendar_notification"."attempts" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "club"."calendar_page" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club"."calendar_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_version" CHECK ("club"."calendar_schedule"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "club"."calendar_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"updates" boolean DEFAULT true NOT NULL,
	"reminder_minutes" integer DEFAULT 1440 NOT NULL,
	"fingerprint" text NOT NULL,
	"subscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_subscriber" UNIQUE("calendar_id","user_id"),
	CONSTRAINT "calendar_subscription_scope" UNIQUE("id","organization_id"),
	CONSTRAINT "calendar_reminder" CHECK ("club"."calendar_subscription"."reminder_minutes" in (0,60,1440))
);
--> statement-breakpoint
ALTER TABLE "club"."feature" DROP CONSTRAINT "feature_key";--> statement-breakpoint
ALTER TABLE "club"."calendar" ADD CONSTRAINT "calendar_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."calendar_notification" ADD CONSTRAINT "calendar_notification_subscription_id_organization_id_calendar_subscription_id_organization_id_fk" FOREIGN KEY ("subscription_id","organization_id") REFERENCES "club"."calendar_subscription"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."calendar_page" ADD CONSTRAINT "calendar_page_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."calendar_schedule" ADD CONSTRAINT "calendar_schedule_calendar_id_organization_id_calendar_id_organization_id_fk" FOREIGN KEY ("calendar_id","organization_id") REFERENCES "club"."calendar"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."calendar_subscription" ADD CONSTRAINT "calendar_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."calendar_subscription" ADD CONSTRAINT "calendar_subscription_calendar_id_organization_id_calendar_id_organization_id_fk" FOREIGN KEY ("calendar_id","organization_id") REFERENCES "club"."calendar"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_org" ON "club"."calendar" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "calendar_notice_queue" ON "club"."calendar_notification" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "calendar_notice_org" ON "club"."calendar_notification" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "schedule_calendar" ON "club"."calendar_schedule" USING btree ("calendar_id","organization_id");--> statement-breakpoint
CREATE INDEX "schedule_org" ON "club"."calendar_schedule" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "calendar_subscription_user" ON "club"."calendar_subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_subscription_queue" ON "club"."calendar_subscription" USING btree ("active","checked_at");--> statement-breakpoint
CREATE INDEX "calendar_subscription_org" ON "club"."calendar_subscription" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "club"."feature" ADD CONSTRAINT "feature_key" CHECK ("club"."feature"."key" in ('forms', 'events', 'calendar'));