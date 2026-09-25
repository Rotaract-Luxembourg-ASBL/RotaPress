ALTER TABLE "club"."organization" ADD COLUMN "profile" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."organization" ADD COLUMN "staff_login" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "club"."google_auth_configuration" ADD COLUMN "hosted_domain" text DEFAULT '' NOT NULL;