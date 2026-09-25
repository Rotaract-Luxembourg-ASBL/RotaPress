CREATE TABLE "club"."apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp with time zone,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 60000,
	"rate_limit_max" integer DEFAULT 120,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"permissions" text,
	"metadata" text,
	CONSTRAINT "apikey_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "club"."automation_import" (
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"input_hash" text NOT NULL,
	"receipt" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_import_organization_id_request_id_pk" PRIMARY KEY("organization_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "club"."automation_import" ADD CONSTRAINT "automation_import_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "club"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club"."automation_import" ADD CONSTRAINT "automation_import_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "club"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apikey_reference_idx" ON "club"."apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_config_idx" ON "club"."apikey" USING btree ("config_id");