CREATE TYPE "public"."expense_category" AS ENUM('transport', 'hotels', 'food', 'activities', 'shopping', 'other');--> statement-breakpoint
CREATE TABLE "expense_split" (
	"id" text PRIMARY KEY NOT NULL,
	"expense_id" text NOT NULL,
	"account_id" text NOT NULL,
	"share_amount" double precision,
	"share_pct" double precision
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"day_idx" integer,
	"category" "expense_category" NOT NULL,
	"label" text,
	"amount" double precision NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"paid_by" text,
	"note" text,
	"at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "expense_split" ADD CONSTRAINT "expense_split_expense_id_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expense"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_split" ADD CONSTRAINT "expense_split_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_split_unique" ON "expense_split" USING btree ("expense_id","account_id");--> statement-breakpoint
CREATE INDEX "expense_trip_idx" ON "expense" USING btree ("trip_id");