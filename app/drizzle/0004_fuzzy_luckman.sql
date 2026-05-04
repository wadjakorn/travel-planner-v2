CREATE TYPE "public"."note_kind" AS ENUM('checklist', 'doc');--> statement-breakpoint
CREATE TABLE "checklist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"idx" integer NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"idx" integer NOT NULL,
	"kind" "note_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_item_note_idx_unique" ON "checklist_item" USING btree ("note_id","idx");--> statement-breakpoint
CREATE INDEX "note_trip_idx" ON "note" USING btree ("trip_id");