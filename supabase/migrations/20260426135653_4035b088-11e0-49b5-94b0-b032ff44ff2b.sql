CREATE OR REPLACE FUNCTION public.auto_wiki_for_node()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_culture text;
  v_profile text;
  v_summary text;
BEGIN
  v_culture := COALESCE(NEW.culture_key, '');
  v_profile := COALESCE(NEW.profile_key, '');

  -- Discovery: was undiscovered, now discovered, still neutral
  IF NEW.discovered = true
     AND COALESCE(OLD.discovered, false) = false
     AND NEW.is_neutral = true
     AND NEW.controlled_by IS NULL
  THEN
    v_summary := 'Neutrální uzel '
      || CASE WHEN v_culture <> '' THEN '(kultura: ' || v_culture || ') ' ELSE '' END
      || CASE WHEN v_profile <> '' THEN '[profil: ' || v_profile || '] ' ELSE '' END
      || 'objeven hráčem ' || COALESCE(NEW.discovered_by, '?') || '.';

    INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player, summary, tags)
    VALUES (
      NEW.session_id, 'neutral_node', NEW.id, NEW.name,
      COALESCE(NEW.discovered_by, ''),
      v_summary,
      ARRAY['neutral_node', v_culture, v_profile]::text[]
    )
    ON CONFLICT (session_id, entity_type, entity_id) WHERE entity_id IS NOT NULL
    DO UPDATE SET summary = EXCLUDED.summary, updated_at = now();
  END IF;

  -- Annexation
  IF NEW.controlled_by IS NOT NULL
     AND (OLD.controlled_by IS NULL OR OLD.controlled_by IS DISTINCT FROM NEW.controlled_by)
  THEN
    v_summary := 'Anektovaný uzel '
      || CASE WHEN v_culture <> '' THEN '(původní kultura: ' || v_culture || ') ' ELSE '' END
      || 'pod správou ' || NEW.controlled_by || '.';

    UPDATE wiki_entries
    SET entity_type = 'annexed_node',
        owner_player = NEW.controlled_by,
        summary = v_summary,
        tags = ARRAY['annexed_node', v_culture, v_profile]::text[],
        updated_at = now()
    WHERE session_id = NEW.session_id
      AND entity_id = NEW.id
      AND entity_type IN ('neutral_node','annexed_node');

    IF NOT FOUND THEN
      INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player, summary, tags)
      VALUES (NEW.session_id, 'annexed_node', NEW.id, NEW.name, NEW.controlled_by, v_summary,
              ARRAY['annexed_node', v_culture, v_profile]::text[])
      ON CONFLICT (session_id, entity_type, entity_id) WHERE entity_id IS NOT NULL
      DO UPDATE SET owner_player = EXCLUDED.owner_player, summary = EXCLUDED.summary, updated_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;