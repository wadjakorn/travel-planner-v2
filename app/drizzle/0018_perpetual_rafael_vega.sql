ALTER TABLE "day" ADD COLUMN "date_iso" text;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "status" text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "trip" ADD COLUMN "source_url" text;