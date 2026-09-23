CREATE TABLE "club"."luma_reconciliation_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"connection_version" integer NOT NULL,
	"event_version" integer NOT NULL,
	"registration_version" integer NOT NULL,
	"requested_version" integer NOT NULL,
	"link_version" integer NOT NULL,
	"request_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"session_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"error_code" text,
	CONSTRAINT "luma_job_request" UNIQUE("organization_id","request_id"),
	CONSTRAINT "luma_job_status" CHECK ("club"."luma_reconciliation_job"."status" in ('pending', 'processing', 'succeeded', 'cancelled', 'failed')),
	CONSTRAINT "luma_job_attempts" CHECK ("club"."luma_reconciliation_job"."attempts" between 0 and 3),
	CONSTRAINT "luma_job_versions" CHECK ("club"."luma_reconciliation_job"."connection_version" > 0 and "club"."luma_reconciliation_job"."event_version" > 0 and "club"."luma_reconciliation_job"."registration_version" >= 0 and "club"."luma_reconciliation_job"."requested_version" > 0 and "club"."luma_reconciliation_job"."link_version" >= "club"."luma_reconciliation_job"."requested_version"),
	CONSTRAINT "luma_job_lease" CHECK (("club"."luma_reconciliation_job"."status" = 'processing' and "club"."luma_reconciliation_job"."lease_token" is not null and "club"."luma_reconciliation_job"."lease_expires_at" is not null) or ("club"."luma_reconciliation_job"."status" <> 'processing' and "club"."luma_reconciliation_job"."lease_token" is null and "club"."luma_reconciliation_job"."lease_expires_at" is null)),
	CONSTRAINT "luma_job_completion" CHECK (("club"."luma_reconciliation_job"."status" in ('pending', 'processing')) = ("club"."luma_reconciliation_job"."finished_at" is null))
);
--> statement-breakpoint
ALTER TABLE "club"."luma_reconciliation_job" ADD CONSTRAINT "luma_reconciliation_job_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."luma_reconciliation_job" ADD CONSTRAINT "luma_reconciliation_job_event_id_organization_id_luma_api_event_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."luma_api_event"("event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."luma_reconciliation_job" ADD CONSTRAINT "luma_reconciliation_job_connection_id_organization_id_luma_connection_id_organization_id_fk" FOREIGN KEY ("connection_id","organization_id") REFERENCES "club"."luma_connection"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "luma_job_active" ON "club"."luma_reconciliation_job" USING btree ("event_id") WHERE "club"."luma_reconciliation_job"."status" in ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "luma_job_due" ON "club"."luma_reconciliation_job" USING btree ("available_at") WHERE "club"."luma_reconciliation_job"."status" in ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "luma_job_history" ON "club"."luma_reconciliation_job" USING btree ("event_id","created_at");