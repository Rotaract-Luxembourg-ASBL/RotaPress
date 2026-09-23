CREATE TABLE "club"."event_prize" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"draft" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_revision_id" uuid,
	CONSTRAINT "prize_scope" UNIQUE("id","event_id","organization_id"),
	CONSTRAINT "prize_version" CHECK ("club"."event_prize"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "club"."event_prize_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prize_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prize_revision_scope" UNIQUE("id","prize_id","event_id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "club"."event_module" DROP CONSTRAINT "event_module_key";--> statement-breakpoint
ALTER TABLE "club"."event_prize" ADD CONSTRAINT "event_prize_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_prize_revision" ADD CONSTRAINT "event_prize_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_prize_revision" ADD CONSTRAINT "event_prize_revision_prize_id_event_id_organization_id_event_prize_id_event_id_organization_id_fk" FOREIGN KEY ("prize_id","event_id","organization_id") REFERENCES "club"."event_prize"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prize_event" ON "club"."event_prize" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "prize_revision_history" ON "club"."event_prize_revision" USING btree ("prize_id","created_at");--> statement-breakpoint
ALTER TABLE "club"."event_module" ADD CONSTRAINT "event_module_key" CHECK ("club"."event_module"."key" in ('website', 'gallery', 'sponsors', 'forms', 'registration', 'portal', 'prizes'));
--> statement-breakpoint
-- A published pointer cannot borrow another prize, event or organization's revision.
ALTER TABLE club.event_prize ADD CONSTRAINT prize_published_revision_scope
  FOREIGN KEY (published_revision_id, id, event_id, organization_id)
  REFERENCES club.event_prize_revision (id, prize_id, event_id, organization_id);
