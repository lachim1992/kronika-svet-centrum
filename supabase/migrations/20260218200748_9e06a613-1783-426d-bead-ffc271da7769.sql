
-- 1) DEDUPLICATE CITIES: Keep the oldest record per (session_id, name), re-point references, delete dupes.
-- First, re-point game_events city_id to the canonical (oldest) city
UPDATE game_events ge
SET city_id = canonical.id
FROM cities dup
JOIN (
  SELECT DISTINCT ON (session_id, name) id, session_id, name
  FROM cities
  ORDER BY session_id, name, created_at ASC
) canonical ON canonical.session_id = dup.session_id AND canonical.name = dup.name
WHERE ge.city_id = dup.id AND dup.id != canonical.id;

UPDATE game_events ge
SET secondary_city_id = canonical.id
FROM cities dup
JOIN (
  SELECT DISTINCT ON (session_id, name) id, session_id, name
  FROM cities
  ORDER BY session_id, name, created_at ASC
) canonical ON canonical.session_id = dup.session_id AND canonical.name = dup.name
WHERE ge.secondary_city_id = dup.id AND dup.id != canonical.id;

UPDATE game_events ge
SET attacker_city_id = canonical.id
FROM cities dup
JOIN (
  SELECT DISTINCT ON (session_id, name) id, session_id, name
  FROM cities
  ORDER BY session_id, name, created_at ASC
) canonical ON canonical.session_id = dup.session_id AND canonical.name = dup.name
WHERE ge.attacker_city_id = dup.id AND dup.id != canonical.id;

UPDATE game_events ge
SET defender_city_id = canonical.id
FROM cities dup
JOIN (
  SELECT DISTINCT ON (session_id, name) id, session_id, name
  FROM cities
  ORDER BY session_id, name, created_at ASC
) canonical ON canonical.session_id = dup.session_id AND canonical.name = dup.name
WHERE ge.defender_city_id = dup.id AND dup.id != canonical.id;

-- Re-point city_rumors
UPDATE city_rumors cr
SET city_id = canonical.id
FROM cities dup
JOIN (
  SELECT DISTINCT ON (session_id, name) id, session_id, name
  FROM cities
  ORDER BY session_id, name, created_at ASC
) canonical ON canonical.session_id = dup.session_id AND canonical.name = dup.name
WHERE cr.city_id = dup.id AND dup.id != canonical.id;

-- Re-point wiki_entries entity_id
UPDATE wiki_entries we
SET entity_id = canonical.id
FROM cities dup
JOIN (
  SELECT DISTINCT ON (session_id, name) id, session_id, name
  FROM cities
  ORDER BY session_id, name, created_at ASC
) canonical ON canonical.session_id = dup.session_id AND canonical.name = dup.name
WHERE we.entity_id = dup.id AND dup.id != canonical.id AND we.entity_type = 'city';

-- Re-point encyclopedia_images
UPDATE encyclopedia_images ei
SET entity_id = canonical.id
FROM cities dup
JOIN (
  SELECT DISTINCT ON (session_id, name) id, session_id, name
  FROM cities
  ORDER BY session_id, name, created_at ASC
) canonical ON canonical.session_id = dup.session_id AND canonical.name = dup.name
WHERE ei.entity_id = dup.id AND dup.id != canonical.id AND ei.entity_type = 'city';

-- Re-point event_entity_links
UPDATE event_entity_links eel
SET entity_id = canonical.id
FROM cities dup
JOIN (
  SELECT DISTINCT ON (session_id, name) id, session_id, name
  FROM cities
  ORDER BY session_id, name, created_at ASC
) canonical ON canonical.session_id = dup.session_id AND canonical.name = dup.name
WHERE eel.entity_id = dup.id AND eel.entity_type = 'city' AND dup.id != canonical.id;

-- Re-point great_persons city_id
UPDATE great_persons gp
SET city_id = canonical.id
FROM cities dup
JOIN (
  SELECT DISTINCT ON (session_id, name) id, session_id, name
  FROM cities
  ORDER BY session_id, name, created_at ASC
) canonical ON canonical.session_id = dup.session_id AND canonical.name = dup.name
WHERE gp.city_id = dup.id AND dup.id != canonical.id;

-- Re-point world_memories city_id
UPDATE world_memories wm
SET city_id = canonical.id
FROM cities dup
JOIN (
  SELECT DISTINCT ON (session_id, name) id, session_id, name
  FROM cities
  ORDER BY session_id, name, created_at ASC
) canonical ON canonical.session_id = dup.session_id AND canonical.name = dup.name
WHERE wm.city_id = dup.id AND dup.id != canonical.id;

-- Re-point provinces capital_city_id
UPDATE provinces p
SET capital_city_id = canonical.id
FROM cities dup
JOIN (
  SELECT DISTINCT ON (session_id, name) id, session_id, name
  FROM cities
  ORDER BY session_id, name, created_at ASC
) canonical ON canonical.session_id = dup.session_id AND canonical.name = dup.name
WHERE p.capital_city_id = dup.id AND dup.id != canonical.id;

-- Now delete duplicate city records (non-canonical)
DELETE FROM cities
WHERE id NOT IN (
  SELECT DISTINCT ON (session_id, name) id
  FROM cities
  ORDER BY session_id, name, created_at ASC
);

-- 2) Add unique constraint on cities(session_id, name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cities_session_name_unique ON cities(session_id, name);

-- 3) Backfill wiki_entries.entity_id for all entity types where it's NULL but entity_name matches
-- Cities
UPDATE wiki_entries w
SET entity_id = c.id
FROM cities c
WHERE w.entity_type = 'city'
  AND w.entity_id IS NULL
  AND w.session_id = c.session_id
  AND lower(w.entity_name) = lower(c.name);

-- Provinces
UPDATE wiki_entries w
SET entity_id = p.id
FROM provinces p
WHERE w.entity_type = 'province'
  AND w.entity_id IS NULL
  AND w.session_id = p.session_id
  AND lower(w.entity_name) = lower(p.name);

-- Regions
UPDATE wiki_entries w
SET entity_id = r.id
FROM regions r
WHERE w.entity_type = 'region'
  AND w.entity_id IS NULL
  AND w.session_id = r.session_id
  AND lower(w.entity_name) = lower(r.name);

-- Wonders
UPDATE wiki_entries w
SET entity_id = wd.id
FROM wonders wd
WHERE w.entity_type = 'wonder'
  AND w.entity_id IS NULL
  AND w.session_id = wd.session_id
  AND lower(w.entity_name) = lower(wd.name);

-- Great persons
UPDATE wiki_entries w
SET entity_id = gp.id
FROM great_persons gp
WHERE w.entity_type IN ('person', 'personality')
  AND w.entity_id IS NULL
  AND w.session_id = gp.session_id
  AND lower(w.entity_name) = lower(gp.name);

-- 4) Create a trigger function to auto-create wiki_entries when a city is inserted
CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_city()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
  VALUES (NEW.session_id, 'city', NEW.id, NEW.name, NEW.owner_player)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_auto_wiki_city ON cities;
CREATE TRIGGER trg_auto_wiki_city
  AFTER INSERT ON cities
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_wiki_entry_for_city();

-- Same for provinces
CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_province()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
  VALUES (NEW.session_id, 'province', NEW.id, NEW.name, NEW.owner_player)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_auto_wiki_province ON provinces;
CREATE TRIGGER trg_auto_wiki_province
  AFTER INSERT ON provinces
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_wiki_entry_for_province();

-- Same for regions
CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_region()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
  VALUES (NEW.session_id, 'region', NEW.id, NEW.name, COALESCE(NEW.owner_player, ''))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_auto_wiki_region ON regions;
CREATE TRIGGER trg_auto_wiki_region
  AFTER INSERT ON regions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_wiki_entry_for_region();

-- Same for wonders
CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_wonder()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
  VALUES (NEW.session_id, 'wonder', NEW.id, NEW.name, NEW.owner_player)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_auto_wiki_wonder ON wonders;
CREATE TRIGGER trg_auto_wiki_wonder
  AFTER INSERT ON wonders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_wiki_entry_for_wonder();

-- Same for great_persons
CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_person()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
  VALUES (NEW.session_id, 'person', NEW.id, NEW.name, NEW.player_name)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_auto_wiki_person ON great_persons;
CREATE TRIGGER trg_auto_wiki_person
  AFTER INSERT ON great_persons
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_wiki_entry_for_person();

-- 5) Seed wiki_entries for ALL existing entities that don't have one yet
INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
SELECT c.session_id, 'city', c.id, c.name, c.owner_player
FROM cities c
LEFT JOIN wiki_entries w ON w.entity_id = c.id AND w.entity_type = 'city'
WHERE w.id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
SELECT p.session_id, 'province', p.id, p.name, p.owner_player
FROM provinces p
LEFT JOIN wiki_entries w ON w.entity_id = p.id AND w.entity_type = 'province'
WHERE w.id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
SELECT r.session_id, 'region', r.id, r.name, COALESCE(r.owner_player, '')
FROM regions r
LEFT JOIN wiki_entries w ON w.entity_id = r.id AND w.entity_type = 'region'
WHERE w.id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
SELECT wd.session_id, 'wonder', wd.id, wd.name, wd.owner_player
FROM wonders wd
LEFT JOIN wiki_entries w ON w.entity_id = wd.id AND w.entity_type = 'wonder'
WHERE w.id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player)
SELECT gp.session_id, 'person', gp.id, gp.name, gp.player_name
FROM great_persons gp
LEFT JOIN wiki_entries w ON w.entity_id = gp.id AND w.entity_type = 'person'
WHERE w.id IS NULL
ON CONFLICT DO NOTHING;
