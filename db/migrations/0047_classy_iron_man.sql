CREATE TABLE "club"."automation_export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"generation" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"data" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "automation_export_size" CHECK ("club"."automation_export"."size" >= 0 and "club"."automation_export"."size" <= 10485760),
	CONSTRAINT "automation_export_hash" CHECK ("club"."automation_export"."sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "club"."automation_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"task_id" uuid,
	"generation" uuid NOT NULL,
	"operation" text NOT NULL,
	"input_hash" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_receipt_request" UNIQUE("organization_id","actor_user_id","request_id"),
	CONSTRAINT "automation_receipt_hash" CHECK ("club"."automation_receipt"."input_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "club"."content_generation" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"generation" uuid DEFAULT gen_random_uuid() NOT NULL,
	"reset_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "club"."media_upload_session" ADD COLUMN "chunk_size" integer DEFAULT 4194304 NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."automation_export" ADD CONSTRAINT "automation_export_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."automation_export" ADD CONSTRAINT "automation_export_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."automation_receipt" ADD CONSTRAINT "automation_receipt_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."automation_receipt" ADD CONSTRAINT "automation_receipt_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."content_generation" ADD CONSTRAINT "content_generation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_export_expiry" ON "club"."automation_export" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "automation_receipt_task" ON "club"."automation_receipt" USING btree ("organization_id","actor_user_id","task_id");--> statement-breakpoint
ALTER TABLE "club"."media_upload_session" ADD CONSTRAINT "media_upload_chunk_size" CHECK ("club"."media_upload_session"."chunk_size" in (65536, 4194304));
--> statement-breakpoint
-- Every installation, including synthetic fixtures, receives its own epoch.
INSERT INTO club.content_generation (organization_id) SELECT id FROM club.organization;
--> statement-breakpoint
CREATE FUNCTION club.initialize_content_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO club.content_generation (organization_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER organization_content_generation AFTER INSERT ON club.organization
FOR EACH ROW EXECUTE FUNCTION club.initialize_content_generation();
