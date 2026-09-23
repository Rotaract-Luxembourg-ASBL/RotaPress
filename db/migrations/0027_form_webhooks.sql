CREATE TABLE "club"."form_webhook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"secret" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_webhook_form" UNIQUE("form_id"),
	CONSTRAINT "form_webhook_scope" UNIQUE("id","form_id","organization_id"),
	CONSTRAINT "form_webhook_revision" CHECK ("club"."form_webhook"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "club"."form_webhook_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"last_error_code" text,
	"sent_at" timestamp with time zone,
	CONSTRAINT "form_webhook_submission" UNIQUE("webhook_id","submission_id"),
	CONSTRAINT "form_webhook_delivery_status" CHECK ("club"."form_webhook_delivery"."status" in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
	CONSTRAINT "form_webhook_delivery_attempts" CHECK ("club"."form_webhook_delivery"."attempts" >= 0 and "club"."form_webhook_delivery"."revision" > 0),
	CONSTRAINT "form_webhook_delivery_lease" CHECK (("club"."form_webhook_delivery"."status" = 'processing') = ("club"."form_webhook_delivery"."lease_token" is not null and "club"."form_webhook_delivery"."lease_expires_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "club"."form_webhook" ADD CONSTRAINT "form_webhook_form_id_organization_id_form_id_organization_id_fk" FOREIGN KEY ("form_id","organization_id") REFERENCES "club"."form"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."form_webhook_delivery" ADD CONSTRAINT "form_webhook_delivery_webhook_id_form_id_organization_id_form_webhook_id_form_id_organization_id_fk" FOREIGN KEY ("webhook_id","form_id","organization_id") REFERENCES "club"."form_webhook"("id","form_id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."form_webhook_delivery" ADD CONSTRAINT "form_webhook_delivery_submission_id_form_id_organization_id_form_submission_id_form_id_organization_id_fk" FOREIGN KEY ("submission_id","form_id","organization_id") REFERENCES "club"."form_submission"("id","form_id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_webhook_queue" ON "club"."form_webhook_delivery" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "form_webhook_history" ON "club"."form_webhook_delivery" USING btree ("form_id","created_at");--> statement-breakpoint
CREATE INDEX "form_webhook_response" ON "club"."form_webhook_delivery" USING btree ("submission_id");