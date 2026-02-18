
-- Step 1: Delete duplicate wiki_entries, keeping the one with the most content (preferring rows with ai_description and image_url)
DELETE FROM wiki_entries
WHERE id NOT IN (
  SELECT DISTINCT ON (session_id, entity_type, entity_id)
    id
  FROM wiki_entries
  WHERE entity_id IS NOT NULL
  ORDER BY session_id, entity_type, entity_id,
    (CASE WHEN ai_description IS NOT NULL THEN 1 ELSE 0 END) DESC,
    (CASE WHEN image_url IS NOT NULL THEN 1 ELSE 0 END) DESC,
    updated_at DESC
)
AND entity_id IS NOT NULL;

-- Step 2: Also clean up any entries with NULL entity_id that have a matching entry with entity_id
DELETE FROM wiki_entries w1
WHERE w1.entity_id IS NULL
AND EXISTS (
  SELECT 1 FROM wiki_entries w2
  WHERE w2.session_id = w1.session_id
  AND w2.entity_type = w1.entity_type
  AND w2.entity_name = w1.entity_name
  AND w2.entity_id IS NOT NULL
);

-- Step 3: Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_wiki_entries_entity
ON wiki_entries (session_id, entity_type, entity_id)
WHERE entity_id IS NOT NULL;

-- Step 4: Update the auto-create triggers to use ON CONFLICT properly
CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_city()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
  VALUES (NEW.session_id, 'city', NEW.id, NEW.name, NEW.owner_player)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_province()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
  VALUES (NEW.session_id, 'province', NEW.id, NEW.name, NEW.owner_player)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_region()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
  VALUES (NEW.session_id, 'region', NEW.id, NEW.name, COALESCE(NEW.owner_player, ''))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_wonder()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
  VALUES (NEW.session_id, 'wonder', NEW.id, NEW.name, NEW.owner_player)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_person()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
  VALUES (NEW.session_id, 'person', NEW.id, NEW.name, NEW.player_name)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
