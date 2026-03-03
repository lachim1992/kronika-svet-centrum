ALTER TABLE public.league_teams 
  ADD COLUMN IF NOT EXISTS training_focus text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS tactical_preset text NOT NULL DEFAULT 'balanced';

COMMENT ON COLUMN public.league_teams.training_focus IS 'Training emphasis: attack, defense, tactics, discipline, balanced';
COMMENT ON COLUMN public.league_teams.tactical_preset IS 'Match tactics: aggressive, balanced, defensive, counter';