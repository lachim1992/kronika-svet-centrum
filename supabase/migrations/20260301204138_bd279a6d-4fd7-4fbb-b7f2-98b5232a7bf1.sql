-- Add arena flag, building tags, and architectural style to city_buildings
ALTER TABLE public.city_buildings 
  ADD COLUMN IF NOT EXISTS is_arena BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS building_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS architectural_style TEXT;

-- Index for fast arena lookups
CREATE INDEX IF NOT EXISTS idx_city_buildings_is_arena ON public.city_buildings(city_id, is_arena) WHERE is_arena = true;

-- Backfill existing arenas by name patterns
UPDATE public.city_buildings 
SET is_arena = true, building_tags = array_append(COALESCE(building_tags, '{}'), 'arena')
WHERE LOWER(name) SIMILAR TO '%(aréna|arena|stadion|amfiteátr|závodiště|colosseum|koloseum)%'
  AND is_arena = false;

-- Auto-create wiki_entries for AI-generated and unique buildings when completed
CREATE OR REPLACE FUNCTION public.auto_create_wiki_entry_for_building()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Only for completed AI-generated or unique buildings
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND
     (NEW.is_ai_generated = true OR NEW.is_wonder = true) THEN
    INSERT INTO wiki_entries (session_id, entity_type, entity_id, entity_name, owner_player, summary, image_url, image_prompt)
    VALUES (
      NEW.session_id,
      CASE WHEN NEW.is_wonder THEN 'wonder' ELSE 'building' END,
      NEW.id,
      NEW.name,
      (SELECT owner_player FROM cities WHERE id = NEW.city_id LIMIT 1),
      COALESCE(NEW.description, ''),
      NEW.image_url,
      NEW.image_prompt
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_building_wiki_sync
  AFTER INSERT OR UPDATE OF status ON public.city_buildings
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_wiki_entry_for_building();