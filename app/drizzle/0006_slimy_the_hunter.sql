CREATE TYPE "public"."lang" AS ENUM('en', 'th');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TYPE "public"."units" AS ENUM('metric', 'imperial');--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"lang" "lang" DEFAULT 'en' NOT NULL,
	"units" "units" DEFAULT 'metric' NOT NULL,
	"notif_email" boolean DEFAULT true NOT NULL,
	"notif_push" boolean DEFAULT true NOT NULL,
	"public_trip" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;