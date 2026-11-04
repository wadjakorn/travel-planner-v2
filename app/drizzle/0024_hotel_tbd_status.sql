ALTER TABLE "hotel_booking" ADD COLUMN "status" text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "hotel_booking" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "hotel_booking" ADD COLUMN "coords_approx" boolean DEFAULT false NOT NULL;