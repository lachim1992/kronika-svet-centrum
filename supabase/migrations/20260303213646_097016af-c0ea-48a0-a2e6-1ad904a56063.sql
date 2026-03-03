
-- Step 1: Add column
ALTER TABLE public.sports_associations ADD COLUMN IF NOT EXISTS association_type text NOT NULL DEFAULT 'sphaera';

-- Step 2: Deduplicate
DELETE FROM public.sports_associations
WHERE id NOT IN (
  SELECT DISTINCT ON (session_id, player_name, association_type) id
  FROM public.sports_associations
  ORDER BY session_id, player_name, association_type, created_at DESC
);

-- Step 3: Unique constraint
ALTER TABLE public.sports_associations ADD CONSTRAINT uq_assoc_type_per_player UNIQUE (session_id, player_name, association_type);

-- Step 4: association_id on league_teams
ALTER TABLE public.league_teams ADD COLUMN IF NOT EXISTS association_id uuid REFERENCES public.sports_associations(id) ON DELETE SET NULL;

-- Step 5: City cap trigger
CREATE OR REPLACE FUNCTION public.check_team_city_cap()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE team_count integer;
BEGIN
  SELECT count(*) INTO team_count FROM league_teams
  WHERE session_id = NEW.session_id AND city_id = NEW.city_id AND is_active = true AND id IS DISTINCT FROM NEW.id;
  IF team_count >= 3 THEN RAISE EXCEPTION 'Maximum 3 active teams per city reached'; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_check_team_city_cap ON public.league_teams;
CREATE TRIGGER trg_check_team_city_cap BEFORE INSERT OR UPDATE ON public.league_teams
  FOR EACH ROW WHEN (NEW.is_active = true) EXECUTE FUNCTION public.check_team_city_cap();
