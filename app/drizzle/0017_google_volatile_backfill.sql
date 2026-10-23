-- TP-0047: legacy rows hold bare Google place ids (no ':'). Their rating/
-- reviews/hours came from Google, so mark them as Google data synced long
-- ago: they are hidden at once and removed by the daily purge cron.
UPDATE "place" SET "rating_synced_at" = '2000-01-01'
WHERE "place_id_external" <> '' AND strpos("place_id_external", ':') = 0
  AND ("rating" IS NOT NULL OR "reviews" IS NOT NULL);--> statement-breakpoint
UPDATE "place" SET "hours_synced_at" = '2000-01-01'
WHERE "place_id_external" <> '' AND strpos("place_id_external", ':') = 0
  AND "hours" IS NOT NULL;
