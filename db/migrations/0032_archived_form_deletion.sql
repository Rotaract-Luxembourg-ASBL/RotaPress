-- Keep version records immutable while their form exists. Permanent form
-- deletion erases versions through this ownership relationship; the runtime
-- role still has no direct UPDATE, DELETE or TRUNCATE on form_version.
ALTER TABLE "club"."form_version" DROP CONSTRAINT "form_version_form_scope";
--> statement-breakpoint
ALTER TABLE "club"."form_version" ADD CONSTRAINT "form_version_form_scope"
  FOREIGN KEY ("form_id", "organization_id")
  REFERENCES "club"."form" ("id", "organization_id") ON DELETE CASCADE;
