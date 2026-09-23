ALTER TABLE "club"."event_manager" DROP CONSTRAINT "event_manager_event_id_pk";--> statement-breakpoint
ALTER TABLE "club"."event_manager" ADD CONSTRAINT "event_manager_event_id_user_id_pk" PRIMARY KEY("event_id","user_id");--> statement-breakpoint
ALTER TABLE "club"."event_manager" ADD COLUMN "role" text DEFAULT 'manager' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_responsible_manager" ON "club"."event_manager" USING btree ("event_id") WHERE "club"."event_manager"."role" = 'manager';--> statement-breakpoint
ALTER TABLE "club"."event_manager" ADD CONSTRAINT "event_assignment_role" CHECK ("club"."event_manager"."role" in ('manager', 'editor'));