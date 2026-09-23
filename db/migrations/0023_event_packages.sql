CREATE TABLE "club"."event_package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"draft" jsonb NOT NULL,
	"source_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"published_revision_id" uuid,
	CONSTRAINT "package_scope" UNIQUE("id","event_id","organization_id"),
	CONSTRAINT "package_version" CHECK ("club"."event_package"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "club"."event_package_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"source_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "package_revision_scope" UNIQUE("id","package_id","event_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "club"."event_package_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "package_source_scope" UNIQUE("id","event_id","organization_id"),
	CONSTRAINT "package_source_url" UNIQUE("event_id","url"),
	CONSTRAINT "package_source_version" CHECK ("club"."event_package_source"."version" > 0),
	CONSTRAINT "package_source_label" CHECK (length("club"."event_package_source"."label") between 1 and 120),
	CONSTRAINT "package_source_url_format" CHECK ("club"."event_package_source"."url" ~ '^https://luma[.]com/[A-Za-z0-9][A-Za-z0-9_-]{0,199}$')
);
--> statement-breakpoint
ALTER TABLE "club"."event_package" ADD CONSTRAINT "event_package_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_package" ADD CONSTRAINT "event_package_source_id_event_id_organization_id_event_package_source_id_event_id_organization_id_fk" FOREIGN KEY ("source_id","event_id","organization_id") REFERENCES "club"."event_package_source"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_package_revision" ADD CONSTRAINT "event_package_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_package_revision" ADD CONSTRAINT "event_package_revision_package_id_event_id_organization_id_event_package_id_event_id_organization_id_fk" FOREIGN KEY ("package_id","event_id","organization_id") REFERENCES "club"."event_package"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_package_revision" ADD CONSTRAINT "event_package_revision_source_id_event_id_organization_id_event_package_source_id_event_id_organization_id_fk" FOREIGN KEY ("source_id","event_id","organization_id") REFERENCES "club"."event_package_source"("id","event_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."event_package_source" ADD CONSTRAINT "event_package_source_event_id_organization_id_event_id_organization_id_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "club"."event"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "package_event" ON "club"."event_package" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "package_source" ON "club"."event_package" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "package_revision_history" ON "club"."event_package_revision" USING btree ("package_id","created_at");--> statement-breakpoint
CREATE INDEX "package_revision_source" ON "club"."event_package_revision" USING btree ("source_id");
--> statement-breakpoint
-- Publication pointers must identify a revision of this exact package and event.
ALTER TABLE club.event_package ADD CONSTRAINT package_published_revision_scope
  FOREIGN KEY (published_revision_id, id, event_id, organization_id)
  REFERENCES club.event_package_revision (id, package_id, event_id, organization_id);
--> statement-breakpoint
-- Existing checkout destinations cannot be silently replaced behind a publication.
CREATE FUNCTION club.protect_package_source_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (NEW.id, NEW.event_id, NEW.organization_id, NEW.url)
    IS DISTINCT FROM (OLD.id, OLD.event_id, OLD.organization_id, OLD.url) THEN
    RAISE EXCEPTION 'Package booking source identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER package_source_identity BEFORE UPDATE ON club.event_package_source
  FOR EACH ROW EXECUTE FUNCTION club.protect_package_source_identity();
