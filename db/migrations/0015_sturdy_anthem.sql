CREATE TABLE "club"."cms_publication_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"publication_version" integer NOT NULL,
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
	CONSTRAINT "cms_publication_request" UNIQUE("organization_id","request_id"),
	CONSTRAINT "cms_publication_status" CHECK ("club"."cms_publication_job"."status" in ('pending', 'processing', 'succeeded', 'cancelled', 'failed')),
	CONSTRAINT "cms_publication_attempts" CHECK ("club"."cms_publication_job"."attempts" between 0 and 3),
	CONSTRAINT "cms_publication_version" CHECK ("club"."cms_publication_job"."publication_version" >= 0),
	CONSTRAINT "cms_publication_lease" CHECK (("club"."cms_publication_job"."status" = 'processing' and "club"."cms_publication_job"."lease_token" is not null and "club"."cms_publication_job"."lease_expires_at" is not null) or ("club"."cms_publication_job"."status" <> 'processing' and "club"."cms_publication_job"."lease_token" is null and "club"."cms_publication_job"."lease_expires_at" is null)),
	CONSTRAINT "cms_publication_completion" CHECK (("club"."cms_publication_job"."status" in ('pending', 'processing')) = ("club"."cms_publication_job"."finished_at" is null))
);
--> statement-breakpoint
ALTER TABLE "club"."cms_variant" ADD COLUMN "publication_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."cms_variant" ADD CONSTRAINT "cms_variant_schedule_scope" UNIQUE("id","content_id","organization_id");--> statement-breakpoint
ALTER TABLE "club"."cms_publication_job" ADD CONSTRAINT "cms_publication_job_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_publication_job" ADD CONSTRAINT "cms_publication_job_content_id_organization_id_cms_content_id_organization_id_fk" FOREIGN KEY ("content_id","organization_id") REFERENCES "club"."cms_content"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_publication_job" ADD CONSTRAINT "cms_publication_job_variant_id_content_id_organization_id_cms_variant_id_content_id_organization_id_fk" FOREIGN KEY ("variant_id","content_id","organization_id") REFERENCES "club"."cms_variant"("id","content_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."cms_publication_job" ADD CONSTRAINT "cms_publication_job_revision_id_variant_id_cms_revision_id_variant_id_fk" FOREIGN KEY ("revision_id","variant_id") REFERENCES "club"."cms_revision"("id","variant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_publication_active" ON "club"."cms_publication_job" USING btree ("variant_id") WHERE "club"."cms_publication_job"."status" in ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "cms_publication_due" ON "club"."cms_publication_job" USING btree ("available_at") WHERE "club"."cms_publication_job"."status" in ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "cms_publication_history" ON "club"."cms_publication_job" USING btree ("variant_id","created_at");
