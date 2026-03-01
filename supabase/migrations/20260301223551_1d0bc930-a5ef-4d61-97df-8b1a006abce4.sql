
-- Add playoff support to league_seasons
ALTER TABLE public.league_seasons
  ADD COLUMN IF NOT EXISTS playoff_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS playoff_bracket jsonb DEFAULT '[]'::jsonb;

-- playoff_status: 'none' | 'quarterfinals' | 'semifinals' | 'final' | 'completed'
-- playoff_bracket: array of { round: 'QF'|'SF'|'F', match_index: number, home_team_id, away_team_id, home_score, away_score, status: 'scheduled'|'played', winner_team_id }

COMMENT ON COLUMN public.league_seasons.playoff_status IS 'Playoff phase: none, quarterfinals, semifinals, final, completed';
COMMENT ON COLUMN public.league_seasons.playoff_bracket IS 'JSONB array of playoff matches with bracket structure';
