
-- Add detailed stats to league_players
ALTER TABLE public.league_players
  ADD COLUMN IF NOT EXISTS overall_rating integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS form integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS condition integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS injury_turns integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goals integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assists integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS matches_played integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yellow_cards integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS red_cards integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS season_rating_avg numeric(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS portrait_url text,
  ADD COLUMN IF NOT EXISTS bio text;

-- Compute initial overall_rating from existing stats
UPDATE public.league_players SET overall_rating = LEAST(99, GREATEST(1,
  (strength + speed + technique + stamina + aggression + leadership) / 6
));

-- Create sports_associations table
CREATE TABLE public.sports_associations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  city_id uuid NOT NULL REFERENCES public.cities(id),
  building_id uuid REFERENCES public.city_buildings(id),
  player_name text NOT NULL,
  name text NOT NULL DEFAULT 'Sportovní asociace',
  motto text,
  description text,
  color_primary text DEFAULT '#2563eb',
  color_secondary text DEFAULT '#1e1e2e',
  emblem_url text,
  scouting_level integer NOT NULL DEFAULT 1,
  youth_development integer NOT NULL DEFAULT 1,
  training_quality integer NOT NULL DEFAULT 1,
  reputation integer NOT NULL DEFAULT 10,
  fan_base integer NOT NULL DEFAULT 50,
  budget integer NOT NULL DEFAULT 0,
  founded_turn integer NOT NULL DEFAULT 1,
  last_intake_turn integer NOT NULL DEFAULT 0,
  intake_cycle_turns integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sports_associations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sports_associations"
  ON public.sports_associations FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert sports_associations"
  ON public.sports_associations FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update sports_associations"
  ON public.sports_associations FOR UPDATE USING (true);

-- Link league_players to association
ALTER TABLE public.league_players
  ADD COLUMN IF NOT EXISTS association_id uuid REFERENCES public.sports_associations(id);

-- Add trigger for updated_at
CREATE TRIGGER update_sports_associations_updated_at
  BEFORE UPDATE ON public.sports_associations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
