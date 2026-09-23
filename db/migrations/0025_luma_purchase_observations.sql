-- Add the parent scope before the new child foreign keys reference it.
ALTER TABLE "club"."luma_guest_projection" ADD CONSTRAINT "luma_guest_purchase_scope" UNIQUE("id","source_id","event_id","organization_id");
--> statement-breakpoint
CREATE TABLE "club"."luma_purchase_identity" (
	"guest_id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club"."luma_purchase_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_order_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club"."luma_purchase_refresh" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"failure_code" text,
	"mode" text NOT NULL,
	"recipient_email" text NOT NULL,
	"source_version" integer NOT NULL,
	"api_version" integer NOT NULL,
	"connection_id" uuid NOT NULL,
	"connection_version" integer NOT NULL,
	"guest_observed_at" timestamp with time zone NOT NULL,
	"snapshot" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "purchase_refresh_versions" CHECK ("club"."luma_purchase_refresh"."version" > 0 and "club"."luma_purchase_refresh"."source_version" > 0 and "club"."luma_purchase_refresh"."api_version" > 0 and "club"."luma_purchase_refresh"."connection_version" > 0),
	CONSTRAINT "purchase_refresh_state" CHECK (("club"."luma_purchase_refresh"."status" = 'running' and "club"."luma_purchase_refresh"."finished_at" is null and "club"."luma_purchase_refresh"."snapshot" is null) or ("club"."luma_purchase_refresh"."status" = 'failed' and "club"."luma_purchase_refresh"."finished_at" is not null and "club"."luma_purchase_refresh"."snapshot" is null) or ("club"."luma_purchase_refresh"."status" = 'succeeded' and "club"."luma_purchase_refresh"."finished_at" is not null and "club"."luma_purchase_refresh"."snapshot" is not null)),
	CONSTRAINT "purchase_refresh_mode" CHECK ("club"."luma_purchase_refresh"."mode" in ('fixture', 'live')),
	CONSTRAINT "purchase_refresh_failure" CHECK (("club"."luma_purchase_refresh"."status" = 'failed' and "club"."luma_purchase_refresh"."failure_code" is not null and "club"."luma_purchase_refresh"."failure_code" in ('refresh_failed', 'identity_changed')) or ("club"."luma_purchase_refresh"."status" <> 'failed' and "club"."luma_purchase_refresh"."failure_code" is null)),
	CONSTRAINT "purchase_refresh_email" CHECK ("club"."luma_purchase_refresh"."recipient_email" = lower(trim("club"."luma_purchase_refresh"."recipient_email")) and length("club"."luma_purchase_refresh"."recipient_email") between 3 and 254)
);
--> statement-breakpoint
ALTER TABLE "club"."luma_purchase_identity" ADD CONSTRAINT "purchase_identity_guest_scope" FOREIGN KEY ("guest_id","source_id","event_id","organization_id") REFERENCES "club"."luma_guest_projection"("id","source_id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."luma_purchase_order" ADD CONSTRAINT "purchase_order_guest_scope" FOREIGN KEY ("guest_id","source_id","event_id","organization_id") REFERENCES "club"."luma_guest_projection"("id","source_id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."luma_purchase_refresh" ADD CONSTRAINT "purchase_refresh_connection_scope" FOREIGN KEY ("connection_id","organization_id") REFERENCES "club"."luma_connection"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."luma_purchase_refresh" ADD CONSTRAINT "purchase_refresh_guest_scope" FOREIGN KEY ("guest_id","source_id","event_id","organization_id") REFERENCES "club"."luma_guest_projection"("id","source_id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_identity_event" ON "club"."luma_purchase_identity" USING btree ("event_id","organization_id");--> statement-breakpoint
CREATE INDEX "purchase_identity_source" ON "club"."luma_purchase_identity" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_source_identity" ON "club"."luma_purchase_order" USING btree ("source_id","provider_order_id");--> statement-breakpoint
CREATE INDEX "purchase_order_guest" ON "club"."luma_purchase_order" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "purchase_order_event" ON "club"."luma_purchase_order" USING btree ("event_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_refresh_request" ON "club"."luma_purchase_refresh" USING btree ("organization_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_refresh_guest_version" ON "club"."luma_purchase_refresh" USING btree ("guest_id","version");--> statement-breakpoint
CREATE INDEX "purchase_refresh_event" ON "club"."luma_purchase_refresh" USING btree ("event_id","organization_id");--> statement-breakpoint
CREATE INDEX "purchase_refresh_source" ON "club"."luma_purchase_refresh" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "purchase_refresh_connection" ON "club"."luma_purchase_refresh" USING btree ("connection_id");--> statement-breakpoint
-- Only an unfinished refresh can transition once to a completed observation.
CREATE FUNCTION "club"."protect_purchase_observation"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.status <> 'running' OR NEW.status NOT IN ('succeeded', 'failed')
     OR (to_jsonb(NEW) - ARRAY['status', 'failure_code', 'snapshot', 'finished_at'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['status', 'failure_code', 'snapshot', 'finished_at']) THEN
    RAISE EXCEPTION 'Completed purchase observations and their scope are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "purchase_observation_immutable"
BEFORE UPDATE ON "club"."luma_purchase_refresh"
FOR EACH ROW EXECUTE FUNCTION "club"."protect_purchase_observation"();
