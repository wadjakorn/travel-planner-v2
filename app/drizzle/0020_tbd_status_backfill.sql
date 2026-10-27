-- TP-0042: existing places tagged "รอระบุ" (Thai "to be specified") encode a
-- planning status in a free-text tag. Promote that tag to the typed status
-- column, then strip the tag so the two representations never drift. jsonb
-- containment (@>) matches the tag anywhere in the array.
UPDATE "place" SET "status" = 'tbd' WHERE "tags" @> '["รอระบุ"]'::jsonb;--> statement-breakpoint
UPDATE "place"
SET "tags" = COALESCE(
  (SELECT jsonb_agg(elem) FROM jsonb_array_elements("tags") AS elem WHERE elem <> '"รอระบุ"'::jsonb),
  '[]'::jsonb
)
WHERE "tags" @> '["รอระบุ"]'::jsonb;
