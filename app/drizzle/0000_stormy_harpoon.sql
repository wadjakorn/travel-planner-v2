CREATE TYPE "public"."place_kind" AS ENUM('hotel', 'food', 'sight', 'transit');--> statement-breakpoint
CREATE TYPE "public"."segment_mode" AS ENUM('drive', 'walk', 'transit');--> statement-breakpoint
CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "authenticator" (
	"credentialID" text NOT NULL,
	"userId" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"credentialPublicKey" text NOT NULL,
	"counter" integer NOT NULL,
	"credentialDeviceType" text NOT NULL,
	"credentialBackedUp" boolean NOT NULL,
	"transports" text,
	CONSTRAINT "authenticator_userId_credentialID_pk" PRIMARY KEY("userId","credentialID"),
	CONSTRAINT "authenticator_credentialID_unique" UNIQUE("credentialID")
);
--> statement-breakpoint
CREATE TABLE "day" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"idx" integer NOT NULL,
	"label" text NOT NULL,
	"num" integer NOT NULL,
	"date" text NOT NULL,
	"title" text NOT NULL,
	"summary_distance" text,
	"summary_time" text,
	"optimize_savings_time" text,
	"optimize_savings_swap" text
);
--> statement-breakpoint
CREATE TABLE "place" (
	"id" text PRIMARY KEY NOT NULL,
	"day_id" text NOT NULL,
	"idx" integer NOT NULL,
	"kind" "place_kind" NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"rating" double precision,
	"reviews" integer,
	"time" text,
	"duration" text,
	"price" text,
	"address" text,
	"phone" text,
	"website" text,
	"hours" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"thumb" text,
	"note" text,
	"booking_ref" text,
	"booking_room" text,
	"booking_nights" integer,
	"booking_total" text,
	"x" integer,
	"y" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "segment" (
	"id" text PRIMARY KEY NOT NULL,
	"day_id" text NOT NULL,
	"idx" integer NOT NULL,
	"mode" "segment_mode" NOT NULL,
	"distance" text NOT NULL,
	"time" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"start_date" text,
	"end_date" text,
	"cover" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"collaborators" jsonb DEFAULT '[]'::jsonb,
	"recco" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authenticator" ADD CONSTRAINT "authenticator_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day" ADD CONSTRAINT "day_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place" ADD CONSTRAINT "place_day_id_day_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."day"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment" ADD CONSTRAINT "segment_day_id_day_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."day"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip" ADD CONSTRAINT "trip_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "day_trip_idx_unique" ON "day" USING btree ("trip_id","idx");--> statement-breakpoint
CREATE UNIQUE INDEX "place_day_idx_unique" ON "place" USING btree ("day_id","idx");--> statement-breakpoint
CREATE UNIQUE INDEX "segment_day_idx_unique" ON "segment" USING btree ("day_id","idx");--> statement-breakpoint
CREATE INDEX "trip_owner_idx" ON "trip" USING btree ("owner_id");