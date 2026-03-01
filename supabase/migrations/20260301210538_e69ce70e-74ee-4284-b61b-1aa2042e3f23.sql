
-- ═══ LEAGUE SYSTEM: Sphaera — Arénový míč ═══

-- Teams linked to cities (one stadium = one team)
CREATE TABLE public.league_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id),
  city_id UUID NOT NULL REFERENCES cities(id),
  stadium_building_id UUID REFERENCES city_buildings(id),
  player_name TEXT NOT NULL,
  team_name TEXT NOT NULL,
  motto TEXT,
  color_primary TEXT DEFAULT '#c4a000',
  color_secondary TEXT DEFAULT '#1a1a2e',
  attack_rating INTEGER DEFAULT 50,
  defense_rating INTEGER DEFAULT 50,
  tactics_rating INTEGER DEFAULT 50,
  discipline_rating INTEGER DEFAULT 50,
  popularity INTEGER DEFAULT 10,
  fan_base INTEGER DEFAULT 100,
  titles_won INTEGER DEFAULT 0,
  seasons_played INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_draws INTEGER DEFAULT 0,
  total_losses INTEGER DEFAULT 0,
  total_goals_for INTEGER DEFAULT 0,
  total_goals_against INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, city_id)
);

-- Team roster (11 players per team)
CREATE TABLE public.league_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id),
  team_id UUID NOT NULL REFERENCES league_teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT 'midfielder', -- goalkeeper, defender, midfielder, attacker
  strength INTEGER DEFAULT 50,
  speed INTEGER DEFAULT 50,
  technique INTEGER DEFAULT 50,
  stamina INTEGER DEFAULT 50,
  aggression INTEGER DEFAULT 50,
  leadership INTEGER DEFAULT 0,
  is_captain BOOLEAN DEFAULT false,
  is_injured BOOLEAN DEFAULT false,
  goals_scored INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  yellow_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  matches_played INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- League seasons
CREATE TABLE public.league_seasons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id),
  season_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active', -- active, concluded
  started_turn INTEGER NOT NULL,
  ended_turn INTEGER,
  total_rounds INTEGER NOT NULL DEFAULT 0,
  current_round INTEGER NOT NULL DEFAULT 0,
  matches_per_round INTEGER NOT NULL DEFAULT 0,
  champion_team_id UUID REFERENCES league_teams(id),
  top_scorer_player_id UUID REFERENCES league_players(id),
  best_defense_team_id UUID REFERENCES league_teams(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, season_number)
);

-- League standings per season
CREATE TABLE public.league_standings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id),
  season_id UUID NOT NULL REFERENCES league_seasons(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES league_teams(id),
  played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  goals_for INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  form TEXT DEFAULT '', -- last 5 results: W/D/L
  position INTEGER DEFAULT 0,
  UNIQUE(season_id, team_id)
);

-- Individual matches
CREATE TABLE public.league_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id),
  season_id UUID NOT NULL REFERENCES league_seasons(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  turn_number INTEGER NOT NULL,
  home_team_id UUID NOT NULL REFERENCES league_teams(id),
  away_team_id UUID NOT NULL REFERENCES league_teams(id),
  home_score INTEGER,
  away_score INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, played
  match_events JSONB DEFAULT '[]', -- [{minute, type, player_name, detail}]
  attendance INTEGER DEFAULT 0,
  highlight_text TEXT,
  played_turn INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.league_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_matches ENABLE ROW LEVEL SECURITY;

-- Public read, authenticated insert/update for own teams
CREATE POLICY "Anyone can view league teams" ON public.league_teams FOR SELECT USING (true);
CREATE POLICY "Anyone can view league players" ON public.league_players FOR SELECT USING (true);
CREATE POLICY "Anyone can view league seasons" ON public.league_seasons FOR SELECT USING (true);
CREATE POLICY "Anyone can view league standings" ON public.league_standings FOR SELECT USING (true);
CREATE POLICY "Anyone can view league matches" ON public.league_matches FOR SELECT USING (true);

-- Service role handles inserts/updates via edge functions
CREATE POLICY "Service can manage league teams" ON public.league_teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service can manage league players" ON public.league_players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service can manage league seasons" ON public.league_seasons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service can manage league standings" ON public.league_standings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service can manage league matches" ON public.league_matches FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_league_teams_session ON league_teams(session_id);
CREATE INDEX idx_league_players_team ON league_players(team_id);
CREATE INDEX idx_league_matches_season ON league_matches(season_id, round_number);
CREATE INDEX idx_league_standings_season ON league_standings(season_id);

-- Trigger for updated_at
CREATE TRIGGER update_league_teams_updated_at
  BEFORE UPDATE ON public.league_teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
