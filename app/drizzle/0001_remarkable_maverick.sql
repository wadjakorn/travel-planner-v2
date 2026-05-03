CREATE TYPE "public"."transport_type" AS ENUM('flight', 'train', 'car', 'ferry');--> statement-breakpoint
CREATE TABLE "hotel_booking" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"day_idx" integer,
	"name" text NOT NULL,
	"address" text,
	"check_in_date" text,
	"check_in_time" text,
	"check_out_date" text,
	"check_out_time" text,
	"nights" integer,
	"room" text,
	"guests" integer,
	"ref" text,
	"cost_amount" double precision,
	"cost_currency" text,
	"cancellation" text,
	"contact" text,
	"notes" text,
	"attachment_name" text,
	"attachment_size" text,
	"attachment_url" text,
	"thumb" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "transport_booking" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"day_idx" integer,
	"type" "transport_type" NOT NULL,
	"title" text NOT NULL,
	"provider" text,
	"ref" text,
	"from_code" text,
	"from_name" text,
	"from_time" text,
	"from_date" text,
	"from_terminal" text,
	"to_code" text,
	"to_name" text,
	"to_time" text,
	"to_date" text,
	"to_terminal" text,
	"duration" text,
	"seats" text,
	"bag" text,
	"cost_amount" double precision,
	"cost_currency" text,
	"attachment_name" text,
	"attachment_size" text,
	"attachment_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "hotel_booking" ADD CONSTRAINT "hotel_booking_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_booking" ADD CONSTRAINT "transport_booking_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hotel_booking_trip_idx" ON "hotel_booking" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "transport_booking_trip_idx" ON "transport_booking" USING btree ("trip_id");