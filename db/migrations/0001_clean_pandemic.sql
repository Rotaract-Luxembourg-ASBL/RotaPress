CREATE TABLE "club"."owner_recovery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"nominated_email" text NOT NULL,
	"claim_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_recovery_claim_hash_unique" UNIQUE("claim_hash")
);
--> statement-breakpoint
ALTER TABLE "club"."owner_recovery" ADD CONSTRAINT "owner_recovery_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."owner_recovery" ADD CONSTRAINT "owner_recovery_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owner_recovery_user" ON "club"."owner_recovery" USING btree ("user_id");