-- TP-0082: seeded demo trips draw N avatar initials and the hub has always said
-- N+1 travelers; keep that number now that it is real data
-- (budget_config.travelers). Data-only, no DDL. Idempotent (skips rows that
-- already carry travelers) so a re-run on the shared Preview DB is a no-op.
-- The CASE in WHERE keeps jsonb_array_length off non-array values: Postgres
-- does not promise left-to-right AND evaluation.
UPDATE "trip"
SET "budget_config" =
  (CASE WHEN jsonb_typeof("budget_config") = 'object' THEN "budget_config"
        ELSE '{"amount":null,"basis":"total"}'::jsonb END)
  || jsonb_build_object('travelers', jsonb_array_length("collaborators") + 1)
WHERE (CASE WHEN jsonb_typeof("collaborators") = 'array'
            THEN jsonb_array_length("collaborators") ELSE 0 END) BETWEEN 1 AND 98
  AND ("budget_config" IS NULL OR "budget_config"->'travelers' IS NULL);
