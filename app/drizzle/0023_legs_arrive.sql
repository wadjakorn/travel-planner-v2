ALTER TABLE "day" ADD COLUMN "start_mode" "segment_mode";--> statement-breakpoint
ALTER TABLE "day" ADD COLUMN "start_duration_min" integer;--> statement-breakpoint
ALTER TABLE "day" ADD COLUMN "start_note" text;--> statement-breakpoint
ALTER TABLE "segment" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "segment" ADD COLUMN "duration_min" integer;