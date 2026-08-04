ALTER TABLE "trip" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip" ADD COLUMN "budget_config" jsonb;