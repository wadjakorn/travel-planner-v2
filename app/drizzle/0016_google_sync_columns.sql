ALTER TABLE "place" ADD COLUMN "rating_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "hours_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "google_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "google_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "google_status" text;