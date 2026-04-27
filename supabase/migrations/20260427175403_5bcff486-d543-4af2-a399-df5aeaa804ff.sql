-- Deduplicate ai_factions per (session_id, faction_name) keeping the oldest row,
-- then enforce uniqueness so repair/seed can never insert duplicates again.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY session_id, faction_name ORDER BY created_at ASC, id ASC) AS rn
  FROM public.ai_factions
)
DELETE FROM public.ai_factions a
USING ranked r
WHERE a.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ai_factions_session_faction_unique
  ON public.ai_factions (session_id, faction_name);