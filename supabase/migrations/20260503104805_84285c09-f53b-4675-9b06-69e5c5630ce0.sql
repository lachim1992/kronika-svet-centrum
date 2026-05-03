-- Add storage_path + image_version for canonical cover replace mode
ALTER TABLE public.encyclopedia_images
  ADD COLUMN IF NOT EXISTS storage_path text NULL,
  ADD COLUMN IF NOT EXISTS image_version int NOT NULL DEFAULT 1;

-- Preflight cleanup: collapse duplicate cover rows per entity
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY session_id, entity_type, entity_id
      ORDER BY is_primary DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM public.encyclopedia_images
  WHERE kind = 'cover' AND entity_id IS NOT NULL
)
UPDATE public.encyclopedia_images
SET kind = 'illustration', is_primary = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- One canonical cover per entity
CREATE UNIQUE INDEX IF NOT EXISTS encyclopedia_images_one_cover
ON public.encyclopedia_images(session_id, entity_type, entity_id)
WHERE kind = 'cover' AND entity_id IS NOT NULL;

-- One wiki entry per (session, type, entity_id)
-- Preflight: deduplicate first
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY session_id, entity_type, entity_id
      ORDER BY
        (CASE WHEN ai_description IS NOT NULL AND length(ai_description) > 10 THEN 1 ELSE 0 END) DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
    ) AS rn
  FROM public.wiki_entries
  WHERE entity_id IS NOT NULL
)
DELETE FROM public.wiki_entries
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS wiki_entries_entity_unique
ON public.wiki_entries(session_id, entity_type, entity_id)
WHERE entity_id IS NOT NULL;