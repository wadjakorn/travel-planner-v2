ALTER TABLE "trip" ALTER COLUMN "currency" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "trip" ALTER COLUMN "currency" DROP NOT NULL;--> statement-breakpoint
-- Clear the values written by the old column default. They were never a
-- choice, and keeping them means a trip full of THB bookings keeps reporting
-- a USD total of 0. Trips that have a saved budget_config went through the
-- settings form, so their currency is left alone.
UPDATE "trip" SET "currency" = NULL WHERE "budget_config" IS NULL;
