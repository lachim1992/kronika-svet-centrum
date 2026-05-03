-- 1) Historické system fragmenty → event_fragment
UPDATE chronicle_entries SET source_type = 'event_fragment'
WHERE source_type = 'system';

-- 1b) NULL source_type → event_fragment
UPDATE chronicle_entries SET source_type = 'event_fragment'
WHERE source_type IS NULL;

-- 2) Dedup řádných Kronik (non-null turny):
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY session_id, turn_from, turn_to
    ORDER BY length(COALESCE(text,'')) DESC, created_at DESC
  ) AS rn
  FROM chronicle_entries
  WHERE source_type='chronicle' AND turn_from IS NOT NULL AND turn_to IS NOT NULL
)
UPDATE chronicle_entries SET source_type='chronicle_duplicate'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3) Legacy chronicle s NULL turny → chronicle_legacy
UPDATE chronicle_entries SET source_type='chronicle_legacy'
WHERE source_type='chronicle' AND (turn_from IS NULL OR turn_to IS NULL);

-- 4) Unique index — 1 řádná Kronika per (session, turn_from, turn_to)
CREATE UNIQUE INDEX IF NOT EXISTS chronicle_entries_one_world_round
ON chronicle_entries(session_id, turn_from, turn_to)
WHERE source_type='chronicle' AND turn_from IS NOT NULL AND turn_to IS NOT NULL;