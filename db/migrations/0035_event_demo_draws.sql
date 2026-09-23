CREATE TABLE "club"."event_draw" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"mode" text DEFAULT 'demo' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"digest" text NOT NULL,
	"request_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draw_scope" UNIQUE("id","event_id","organization_id"),
	CONSTRAINT "draw_request" UNIQUE("organization_id","request_id"),
	CONSTRAINT "draw_demo_only" CHECK ("club"."event_draw"."mode" = 'demo' and "club"."event_draw"."snapshot"->>'mode' = 'demo'),
	CONSTRAINT "draw_digest" CHECK ("club"."event_draw"."digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "club"."event_draw_result" (
	"draw_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"awards" jsonb NOT NULL,
	"digest" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draw_result_digest" CHECK ("club"."event_draw_result"."digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "club"."event_draw_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draw_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"operation" text NOT NULL,
	"reason" text NOT NULL,
	"public_winners" jsonb NOT NULL,
	"request_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draw_review_version" UNIQUE("draw_id","version"),
	CONSTRAINT "draw_review_request" UNIQUE("organization_id","request_id"),
	CONSTRAINT "draw_review_version_positive" CHECK ("club"."event_draw_review"."version" > 0),
	CONSTRAINT "draw_review_operation" CHECK ("club"."event_draw_review"."operation" in ('cancel', 'publish', 'unpublish')),
	CONSTRAINT "draw_review_reason" CHECK (length(trim("club"."event_draw_review"."reason")) between 5 and 1000),
	CONSTRAINT "draw_review_publication" CHECK (jsonb_typeof("club"."event_draw_review"."public_winners") = 'array' and ("club"."event_draw_review"."operation" = 'publish' or "club"."event_draw_review"."public_winners" = '[]'::jsonb))
);
--> statement-breakpoint
CREATE TABLE "club"."event_draw_slot" (
	"draw_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"prize_id" uuid NOT NULL,
	"unit" integer NOT NULL,
	CONSTRAINT "event_draw_slot_draw_id_prize_id_unit_pk" PRIMARY KEY("draw_id","prize_id","unit"),
	CONSTRAINT "draw_reserved_prize_unit" UNIQUE("prize_id","unit"),
	CONSTRAINT "draw_slot_unit" CHECK ("club"."event_draw_slot"."unit" between 1 and 10000)
);
--> statement-breakpoint
ALTER TABLE "club"."event_draw" ADD CONSTRAINT "event_draw_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_draw" ADD CONSTRAINT "event_draw_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_draw_result" ADD CONSTRAINT "event_draw_result_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_draw_result" ADD CONSTRAINT "event_draw_result_draw_id_event_id_organization_id_event_draw_id_event_id_organization_id_fk" FOREIGN KEY ("draw_id","event_id","organization_id") REFERENCES "club"."event_draw"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_draw_review" ADD CONSTRAINT "event_draw_review_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_draw_review" ADD CONSTRAINT "event_draw_review_draw_id_event_id_organization_id_event_draw_id_event_id_organization_id_fk" FOREIGN KEY ("draw_id","event_id","organization_id") REFERENCES "club"."event_draw"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_draw_slot" ADD CONSTRAINT "event_draw_slot_draw_id_event_id_organization_id_event_draw_id_event_id_organization_id_fk" FOREIGN KEY ("draw_id","event_id","organization_id") REFERENCES "club"."event_draw"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_draw_slot" ADD CONSTRAINT "event_draw_slot_prize_id_event_id_organization_id_event_prize_id_event_id_organization_id_fk" FOREIGN KEY ("prize_id","event_id","organization_id") REFERENCES "club"."event_prize"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draw_event" ON "club"."event_draw" USING btree ("event_id","organization_id");--> statement-breakpoint
CREATE INDEX "draw_creator" ON "club"."event_draw" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "draw_result_event" ON "club"."event_draw_result" USING btree ("event_id","organization_id");--> statement-breakpoint
CREATE INDEX "draw_result_creator" ON "club"."event_draw_result" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "draw_review_event" ON "club"."event_draw_review" USING btree ("event_id","organization_id");--> statement-breakpoint
CREATE INDEX "draw_review_creator" ON "club"."event_draw_review" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "draw_slot_event" ON "club"."event_draw_slot" USING btree ("event_id","organization_id");
--> statement-breakpoint
-- Frozen evidence, results and publication decisions cannot be rewritten.
CREATE FUNCTION club.keep_draw_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Draw history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER draw_history_immutable BEFORE UPDATE OR DELETE ON club.event_draw
  FOR EACH ROW EXECUTE FUNCTION club.keep_draw_history();
--> statement-breakpoint
CREATE TRIGGER draw_result_immutable BEFORE UPDATE OR DELETE ON club.event_draw_result
  FOR EACH ROW EXECUTE FUNCTION club.keep_draw_history();
--> statement-breakpoint
CREATE TRIGGER draw_review_immutable BEFORE UPDATE OR DELETE ON club.event_draw_review
  FOR EACH ROW EXECUTE FUNCTION club.keep_draw_history();
--> statement-breakpoint
-- A reservation is released only after the corresponding void decision is durable.
CREATE FUNCTION club.release_voided_draw_slot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM club.event_draw_review r WHERE r.draw_id = OLD.draw_id
      AND r.event_id = OLD.event_id AND r.organization_id = OLD.organization_id
      AND r.operation = 'cancel'
  ) THEN RAISE EXCEPTION 'Void the draw before releasing a prize reservation'; END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER draw_slot_release BEFORE DELETE ON club.event_draw_slot
  FOR EACH ROW EXECUTE FUNCTION club.release_voided_draw_slot();
