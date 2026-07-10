-- One-time baseline of prod's drizzle migration journal.
-- Marks migrations 0000..0011 as already applied so 'drizzle-kit migrate'
-- treats them as done (schema already exists via db:push) and only applies
-- FUTURE migrations. Safe / idempotent to run once. Run against PROD.

CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  "id" SERIAL PRIMARY KEY,
  "hash" text NOT NULL,
  "created_at" bigint
);

-- Only seed if the journal is empty (prevents double-baseline).
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT v.hash, v.created_at FROM (VALUES
  ('82a72224266408c439bf7e9ba54bf4caa6e35f0ea3dcb47b71844cdd81f2d048', 1777824095398),
  ('982700364d82c9dd9ade6dee7caafba5afd704f4cff43f71acce906367ffc045', 1777826926417),
  ('32d579618eb917a934cdeacf351ca153026a6e9f921260ad6df966fce165bebf', 1777828399594),
  ('ac4fc5147f7e54c2b99327296a84d1f4af5b7b04f53c974d95ab8a48a116d99f', 1777829874500),
  ('7ad63d1a531011faf9ebfaf344d49231e2aaec5b621117ba2bb6215bb9a4d5d5', 1777867001407),
  ('40f19b03b47eb0b7e37de5ab610349d02aedf49b410aeae702fc0a028e773c71', 1777867910004),
  ('ec1dc177806cb494a18d95b451d64ce7db8f93c17803e621c38dc4e01ca6015e', 1777868837007),
  ('a3b03852cb5a509db9b63e29f7ce69135649c9578f9eaee4346c4e5cf4f11e53', 1777870336503),
  ('b9ec7f1bd8e8845dfdb95ffbef2cd104d8bc43e95181c9d6ff99248bd0601a71', 1777886795660),
  ('f04f2ddc4ffc817f6f6b40f86fee858a2ae5ea1c8828bf6ba44201c3ca3e04cc', 1777909809794),
  ('b09f82c0f09d12311265a0bcb56d938d944e23b5fc05ede25309b3515837c2db', 1777913261972),
  ('4d1d35586a2b8ebe2530dfca82808c956fd0cdbb4a06c5863175380e3539e944', 1783669486483)
) AS v(hash, created_at)
WHERE NOT EXISTS (SELECT 1 FROM "drizzle"."__drizzle_migrations");

-- verify: should list 12 rows, newest created_at = 1783669486483
SELECT id, left(hash,12) AS hash12, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at;
