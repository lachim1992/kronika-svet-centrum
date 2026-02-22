
-- World Tick Log: records each tick execution
CREATE TABLE public.world_tick_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  turn_number integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_world_tick_log_session_turn ON public.world_tick_log(session_id, turn_number);
ALTER TABLE public.world_tick_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to world tick log" ON public.world_tick_log FOR ALL USING (true) WITH CHECK (true);

-- Civilization Influence: per-civ influence score per turn
CREATE TABLE public.civ_influence (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  player_name text NOT NULL,
  turn_number integer NOT NULL DEFAULT 1,
  military_score numeric NOT NULL DEFAULT 0,
  trade_score numeric NOT NULL DEFAULT 0,
  diplomatic_score numeric NOT NULL DEFAULT 0,
  territorial_score numeric NOT NULL DEFAULT 0,
  law_stability_score numeric NOT NULL DEFAULT 0,
  reputation_score numeric NOT NULL DEFAULT 0,
  total_influence numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_civ_influence_session_player_turn ON public.civ_influence(session_id, player_name, turn_number);
ALTER TABLE public.civ_influence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to civ influence" ON public.civ_influence FOR ALL USING (true) WITH CHECK (true);

-- Civilization Tensions: per-pair tension score per turn
CREATE TABLE public.civ_tensions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  player_a text NOT NULL,
  player_b text NOT NULL,
  turn_number integer NOT NULL DEFAULT 1,
  border_proximity numeric NOT NULL DEFAULT 0,
  military_diff numeric NOT NULL DEFAULT 0,
  broken_treaties numeric NOT NULL DEFAULT 0,
  trade_embargo numeric NOT NULL DEFAULT 0,
  conflicting_alliances numeric NOT NULL DEFAULT 0,
  total_tension numeric NOT NULL DEFAULT 0,
  crisis_triggered boolean NOT NULL DEFAULT false,
  war_roll_triggered boolean NOT NULL DEFAULT false,
  war_roll_result numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_civ_tensions_session_pair_turn ON public.civ_tensions(session_id, player_a, player_b, turn_number);
ALTER TABLE public.civ_tensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to civ tensions" ON public.civ_tensions FOR ALL USING (true) WITH CHECK (true);

-- Laws: structured law system
CREATE TABLE public.laws (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  player_name text NOT NULL,
  law_name text NOT NULL,
  full_text text NOT NULL,
  structured_effects jsonb NOT NULL DEFAULT '[]'::jsonb,
  enacted_turn integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  repealed_turn integer,
  ai_epic_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.laws ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to laws" ON public.laws FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.civ_influence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.civ_tensions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.world_tick_log;
