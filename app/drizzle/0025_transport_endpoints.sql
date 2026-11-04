ALTER TABLE "transport_booking" ADD COLUMN "from_lat" double precision;--> statement-breakpoint
ALTER TABLE "transport_booking" ADD COLUMN "from_lng" double precision;--> statement-breakpoint
ALTER TABLE "transport_booking" ADD COLUMN "from_place_id" text;--> statement-breakpoint
ALTER TABLE "transport_booking" ADD COLUMN "to_lat" double precision;--> statement-breakpoint
ALTER TABLE "transport_booking" ADD COLUMN "to_lng" double precision;--> statement-breakpoint
ALTER TABLE "transport_booking" ADD COLUMN "to_place_id" text;