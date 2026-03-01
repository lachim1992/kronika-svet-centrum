-- Add injury severity system and death mechanics to league_players
ALTER TABLE public.league_players 
  ADD COLUMN IF NOT EXISTS injury_severity TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS is_dead BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS death_turn INTEGER,
  ADD COLUMN IF NOT EXISTS death_cause TEXT;

-- Add index for quick filtering of available players
CREATE INDEX IF NOT EXISTS idx_league_players_available 
  ON public.league_players (team_id, is_injured, is_dead);
