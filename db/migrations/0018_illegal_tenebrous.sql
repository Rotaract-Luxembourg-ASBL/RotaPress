CREATE TABLE "club"."guest_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"registration_id" uuid,
	"registration_user_id" text,
	"luma_guest_id" uuid,
	"recipient_email" text NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "guest_access_source" CHECK (("club"."guest_access"."registration_id" is not null and "club"."guest_access"."registration_user_id" is not null and "club"."guest_access"."luma_guest_id" is null) or ("club"."guest_access"."registration_id" is null and "club"."guest_access"."registration_user_id" is null and "club"."guest_access"."luma_guest_id" is not null)),
	CONSTRAINT "guest_access_claim" CHECK (("club"."guest_access"."claimed_by" is null) = ("club"."guest_access"."claimed_at" is null)),
	CONSTRAINT "guest_access_native_identity" CHECK ("club"."guest_access"."registration_user_id" is null or "club"."guest_access"."claimed_by" is null or "club"."guest_access"."registration_user_id" = "club"."guest_access"."claimed_by"),
	CONSTRAINT "guest_access_email" CHECK ("club"."guest_access"."recipient_email" = lower(trim("club"."guest_access"."recipient_email")) and length("club"."guest_access"."recipient_email") between 3 and 254),
	CONSTRAINT "guest_access_version" CHECK ("club"."guest_access"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "club"."event_module" DROP CONSTRAINT "event_module_key";--> statement-breakpoint
ALTER TABLE "club"."event_registration" ADD CONSTRAINT "registration_guest_scope" UNIQUE("id","event_id","organization_id","user_id");--> statement-breakpoint
ALTER TABLE "club"."luma_guest_projection" ADD CONSTRAINT "luma_guest_scope" UNIQUE("id","event_id","organization_id");--> statement-breakpoint
ALTER TABLE "club"."guest_access" ADD CONSTRAINT "guest_access_claimed_by_user_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."guest_access" ADD CONSTRAINT "guest_access_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."guest_access" ADD CONSTRAINT "guest_access_event_scope" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."guest_access" ADD CONSTRAINT "guest_access_registration_scope" FOREIGN KEY ("registration_id","event_id","organization_id","registration_user_id") REFERENCES "club"."event_registration"("id","event_id","organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."guest_access" ADD CONSTRAINT "guest_access_provider_scope" FOREIGN KEY ("luma_guest_id","event_id","organization_id") REFERENCES "club"."luma_guest_projection"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_access_native_active" ON "club"."guest_access" USING btree ("registration_id") WHERE "club"."guest_access"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_access_provider_active" ON "club"."guest_access" USING btree ("luma_guest_id") WHERE "club"."guest_access"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "guest_access_event_history" ON "club"."guest_access" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "guest_access_recipient" ON "club"."guest_access" USING btree ("organization_id","recipient_email");--> statement-breakpoint
CREATE INDEX "guest_access_claimed_by" ON "club"."guest_access" USING btree ("claimed_by");--> statement-breakpoint
CREATE INDEX "guest_access_created_by" ON "club"."guest_access" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "guest_access_native_history" ON "club"."guest_access" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "guest_access_provider_history" ON "club"."guest_access" USING btree ("luma_guest_id");--> statement-breakpoint
ALTER TABLE "club"."event_module" ADD CONSTRAINT "event_module_key" CHECK ("club"."event_module"."key" in ('website', 'gallery', 'sponsors', 'forms', 'registration', 'portal'));
