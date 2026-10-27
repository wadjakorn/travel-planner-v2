-- TP-0037: backfill day.date_iso for existing rows. The machine date is
-- trip.start_date + day.idx (idx is 0-based and kept contiguous). Rows whose
-- trip has no start_date cannot be derived and stay NULL — we never guess.
UPDATE "day" SET "date_iso" = to_char(
  ("trip"."start_date")::date + "day"."idx",
  'YYYY-MM-DD'
)
FROM "trip"
WHERE "day"."trip_id" = "trip"."id"
  AND "trip"."start_date" IS NOT NULL
  AND "trip"."start_date" <> ''
  AND "day"."date_iso" IS NULL;
