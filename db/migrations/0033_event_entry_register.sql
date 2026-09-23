CREATE TABLE "club"."event_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"mode" text DEFAULT 'demo' NOT NULL,
	"guest_id" uuid,
	"label" text NOT NULL,
	"reference" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_scope" UNIQUE("id","event_id","organization_id"),
	CONSTRAINT "entry_guest_scope" UNIQUE("id","guest_id","event_id","organization_id"),
	CONSTRAINT "entry_demo_only" CHECK ("club"."event_entry"."mode" = 'demo'),
	CONSTRAINT "entry_label" CHECK (length(trim("club"."event_entry"."label")) between 1 and 100),
	CONSTRAINT "entry_reference" CHECK (length(trim("club"."event_entry"."reference")) between 1 and 240)
);
--> statement-breakpoint
CREATE TABLE "club"."event_entry_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"guest_id" uuid,
	"version" integer NOT NULL,
	"quantity" integer NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"receipt_id" uuid,
	"evidence_key" text NOT NULL,
	"request_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_review_version" UNIQUE("entry_id","version"),
	CONSTRAINT "entry_review_request" UNIQUE("organization_id","request_id"),
	CONSTRAINT "entry_review_version_positive" CHECK ("club"."event_entry_review"."version" > 0),
	CONSTRAINT "entry_review_quantity" CHECK ("club"."event_entry_review"."quantity" between 1 and 10000),
	CONSTRAINT "entry_review_decision" CHECK ("club"."event_entry_review"."decision" in ('approve', 'hold', 'void')),
	CONSTRAINT "entry_review_reason" CHECK (length(trim("club"."event_entry_review"."reason")) between 5 and 1000),
	CONSTRAINT "entry_review_receipt_guest" CHECK ("club"."event_entry_review"."receipt_id" is null or "club"."event_entry_review"."guest_id" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_refresh_entry_scope" ON "club"."luma_purchase_refresh" USING btree ("id","guest_id","event_id","organization_id");--> statement-breakpoint
ALTER TABLE "club"."event_entry" ADD CONSTRAINT "event_entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_entry" ADD CONSTRAINT "event_entry_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_entry" ADD CONSTRAINT "event_entry_guest_id_event_id_organization_id_luma_guest_projection_id_event_id_organization_id_fk" FOREIGN KEY ("guest_id","event_id","organization_id") REFERENCES "club"."luma_guest_projection"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_entry_review" ADD CONSTRAINT "event_entry_review_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_entry_review" ADD CONSTRAINT "event_entry_review_entry_id_event_id_organization_id_event_entry_id_event_id_organization_id_fk" FOREIGN KEY ("entry_id","event_id","organization_id") REFERENCES "club"."event_entry"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_entry_review" ADD CONSTRAINT "entry_review_guest_scope" FOREIGN KEY ("entry_id","guest_id","event_id","organization_id") REFERENCES "club"."event_entry"("id","guest_id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_entry_review" ADD CONSTRAINT "entry_review_receipt_scope" FOREIGN KEY ("receipt_id","guest_id","event_id","organization_id") REFERENCES "club"."luma_purchase_refresh"("id","guest_id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entry_demo_reference" ON "club"."event_entry" USING btree ("event_id","reference") WHERE "club"."event_entry"."guest_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "entry_purchase_reference" ON "club"."event_entry" USING btree ("guest_id","reference") WHERE "club"."event_entry"."guest_id" is not null;--> statement-breakpoint
CREATE INDEX "entry_event" ON "club"."event_entry" USING btree ("event_id","organization_id");--> statement-breakpoint
CREATE INDEX "entry_creator" ON "club"."event_entry" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "entry_review_event" ON "club"."event_entry_review" USING btree ("event_id","organization_id");--> statement-breakpoint
CREATE INDEX "entry_review_receipt" ON "club"."event_entry_review" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "entry_review_creator" ON "club"."event_entry_review" USING btree ("created_by");--> statement-breakpoint
-- Keep operational decisions even when an event or feature is no longer active.
CREATE FUNCTION club.keep_entry_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Entry history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER entry_history_immutable BEFORE UPDATE OR DELETE ON club.event_entry
  FOR EACH ROW EXECUTE FUNCTION club.keep_entry_history();
--> statement-breakpoint
CREATE TRIGGER entry_review_history_immutable BEFORE UPDATE OR DELETE ON club.event_entry_review
  FOR EACH ROW EXECUTE FUNCTION club.keep_entry_history();
