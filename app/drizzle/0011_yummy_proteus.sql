-- NOTE (API-MIGR): api_token and api_idempotency_key were introduced in an
-- earlier PR via `db:push` and never captured in a migration, so drizzle-kit
-- generated this migration as full CREATE TABLEs. Some environments already
-- have those tables (created out-of-band) while a fresh DB has none, and the
-- migrate-based prod DB was missing the new `scope` column. Every statement
-- below is therefore made idempotent so this migration applies cleanly on any
-- DB state: fresh (creates everything), prod (adds only the missing `scope`
-- column), or dev (all no-ops).

CREATE TABLE IF NOT EXISTS "api_idempotency_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status_code" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_token" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"scope" text DEFAULT 'read-write' NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	CONSTRAINT "api_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
-- api_token predates this migration where it was applied via db:push; the
-- CREATE TABLE IF NOT EXISTS above is a no-op there, so add the scope column
-- explicitly for those environments.
ALTER TABLE "api_token" ADD COLUMN IF NOT EXISTS "scope" text DEFAULT 'read-write' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "api_idempotency_key" ADD CONSTRAINT "api_idempotency_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "api_token" ADD CONSTRAINT "api_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_idempotency_user_key_unique" ON "api_idempotency_key" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_token_user_idx" ON "api_token" USING btree ("user_id");
