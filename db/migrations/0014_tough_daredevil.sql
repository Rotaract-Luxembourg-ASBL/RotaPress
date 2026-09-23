CREATE TABLE "club"."luma_api_event" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"attempted_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	CONSTRAINT "luma_api_event_scope" UNIQUE("event_id","organization_id"),
	CONSTRAINT "luma_api_provider_event" UNIQUE("connection_id","provider_event_id"),
	CONSTRAINT "luma_api_event_version" CHECK ("club"."luma_api_event"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "club"."luma_guest_projection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"provider_guest_id" text NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"approval_status" text NOT NULL,
	"ticket_count" integer NOT NULL,
	"present" boolean DEFAULT true NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"last_seen_run_id" uuid NOT NULL,
	CONSTRAINT "luma_guest_provider_identity" UNIQUE("event_id","provider_guest_id"),
	CONSTRAINT "luma_guest_ticket_count" CHECK ("club"."luma_guest_projection"."ticket_count" >= 0 and "club"."luma_guest_projection"."ticket_count" <= 200),
	CONSTRAINT "luma_guest_status" CHECK ("club"."luma_guest_projection"."approval_status" in ('approved', 'session', 'pending_approval', 'invited', 'declined', 'waitlist'))
);
--> statement-breakpoint
CREATE TABLE "club"."luma_sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"guest_count" integer,
	CONSTRAINT "luma_sync_request" UNIQUE("event_id","request_id"),
	CONSTRAINT "luma_sync_status" CHECK ("club"."luma_sync_run"."status" in ('running', 'succeeded', 'failed', 'interrupted')),
	CONSTRAINT "luma_sync_completion" CHECK (("club"."luma_sync_run"."status" = 'running') = ("club"."luma_sync_run"."finished_at" is null)),
	CONSTRAINT "luma_sync_count" CHECK ("club"."luma_sync_run"."guest_count" is null or "club"."luma_sync_run"."guest_count" between 0 and 1000)
);
--> statement-breakpoint
ALTER TABLE "club"."luma_api_event" ADD CONSTRAINT "luma_api_event_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."luma_api_event" ADD CONSTRAINT "luma_api_event_connection_id_organization_id_luma_connection_id_organization_id_fk" FOREIGN KEY ("connection_id","organization_id") REFERENCES "club"."luma_connection"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."luma_guest_projection" ADD CONSTRAINT "luma_guest_projection_event_id_organization_id_luma_api_event_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."luma_api_event"("event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."luma_sync_run" ADD CONSTRAINT "luma_sync_run_event_id_organization_id_luma_api_event_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."luma_api_event"("event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "luma_sync_history" ON "club"."luma_sync_run" USING btree ("event_id","started_at");