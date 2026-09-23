CREATE TABLE "club"."event_registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"event_title" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "event_registration_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "registration_status" CHECK (("club"."event_registration"."status" = 'confirmed' and "club"."event_registration"."cancelled_at" is null) or ("club"."event_registration"."status" = 'cancelled' and "club"."event_registration"."cancelled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "club"."registration_settings" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"authority" text DEFAULT 'none' NOT NULL,
	"form_id" uuid,
	"capacity" integer,
	"open" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "registration_authority" CHECK (("club"."registration_settings"."authority" = 'none' and "club"."registration_settings"."form_id" is null and "club"."registration_settings"."open" = false) or ("club"."registration_settings"."authority" = 'native' and "club"."registration_settings"."form_id" is not null)),
	CONSTRAINT "registration_capacity" CHECK ("club"."registration_settings"."capacity" is null or "club"."registration_settings"."capacity" > 0),
	CONSTRAINT "registration_version" CHECK ("club"."registration_settings"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "club"."event_manager" DROP CONSTRAINT "event_assignment_role";--> statement-breakpoint
ALTER TABLE "club"."event_module" DROP CONSTRAINT "event_module_key";--> statement-breakpoint
ALTER TABLE "club"."form" DROP CONSTRAINT "form_kind";--> statement-breakpoint
ALTER TABLE "club"."form" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "club"."form" ADD CONSTRAINT "form_event_scope" UNIQUE("id","event_id","organization_id");--> statement-breakpoint
ALTER TABLE "club"."event_registration" ADD CONSTRAINT "event_registration_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_registration" ADD CONSTRAINT "event_registration_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_registration" ADD CONSTRAINT "event_registration_form_id_event_id_organization_id_form_id_event_id_organization_id_fk" FOREIGN KEY ("form_id","event_id","organization_id") REFERENCES "club"."form"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_registration" ADD CONSTRAINT "event_registration_submission_id_form_id_organization_id_form_submission_id_form_id_organization_id_fk" FOREIGN KEY ("submission_id","form_id","organization_id") REFERENCES "club"."form_submission"("id","form_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."registration_settings" ADD CONSTRAINT "registration_settings_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."registration_settings" ADD CONSTRAINT "registration_settings_form_id_event_id_organization_id_form_id_event_id_organization_id_fk" FOREIGN KEY ("form_id","event_id","organization_id") REFERENCES "club"."form"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "registration_active_person" ON "club"."event_registration" USING btree ("event_id","user_id") WHERE "club"."event_registration"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "registration_user" ON "club"."event_registration" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "club"."form" ADD CONSTRAINT "form_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_event" ON "club"."form" USING btree ("organization_id","event_id");--> statement-breakpoint
ALTER TABLE "club"."event_manager" ADD CONSTRAINT "event_assignment_role" CHECK ("club"."event_manager"."role" in ('manager', 'editor', 'registration-manager'));--> statement-breakpoint
ALTER TABLE "club"."event_module" ADD CONSTRAINT "event_module_key" CHECK ("club"."event_module"."key" in ('website', 'gallery', 'sponsors', 'forms', 'registration'));--> statement-breakpoint
ALTER TABLE "club"."form" ADD CONSTRAINT "form_event_kind" CHECK (("club"."form"."event_id" is null and "club"."form"."kind" in ('contact', 'membership')) or ("club"."form"."event_id" is not null and "club"."form"."kind" in ('event', 'registration')));--> statement-breakpoint
ALTER TABLE "club"."form" ADD CONSTRAINT "form_kind" CHECK ("club"."form"."kind" in ('contact', 'membership', 'event', 'registration'));