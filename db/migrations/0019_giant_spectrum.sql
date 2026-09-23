CREATE TABLE "club"."luma_webhook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"secret" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"event_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "luma_webhook_organization" UNIQUE("organization_id"),
	CONSTRAINT "luma_webhook_version" CHECK ("club"."luma_webhook"."version" > 0),
	CONSTRAINT "luma_webhook_enabled" CHECK (not "club"."luma_webhook"."enabled" or ("club"."luma_webhook"."secret" is not null and cardinality("club"."luma_webhook"."event_types") > 0)),
	CONSTRAINT "luma_webhook_types" CHECK ("club"."luma_webhook"."event_types" <@ ARRAY['event.created','event.updated','event.canceled','guest.registered','guest.updated','guest.refunded']::text[])
);
--> statement-breakpoint
CREATE TABLE "club"."luma_webhook_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"body_hash" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "luma_webhook_delivery_body" UNIQUE("webhook_id","body_hash"),
	CONSTRAINT "luma_webhook_body_hash" CHECK ("club"."luma_webhook_receipt"."body_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "club"."luma_webhook" ADD CONSTRAINT "luma_webhook_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."luma_webhook_receipt" ADD CONSTRAINT "luma_webhook_receipt_webhook_id_luma_webhook_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "club"."luma_webhook"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "luma_webhook_receipt_recent" ON "club"."luma_webhook_receipt" USING btree ("webhook_id","received_at");