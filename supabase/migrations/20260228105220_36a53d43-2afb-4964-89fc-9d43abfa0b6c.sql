
CREATE TABLE public.player_watches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('city', 'province')),
  entity_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_player_watches_unique ON player_watches(session_id, player_name, entity_type, entity_id);

ALTER TABLE player_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own watches" ON player_watches
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.turn_briefings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  briefing_text TEXT NOT NULL,
  watched_reports JSONB DEFAULT '[]',
  data_summary JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_turn_briefings_unique ON turn_briefings(session_id, player_name, turn_number);

ALTER TABLE turn_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own briefings" ON turn_briefings
  FOR SELECT USING (true);

CREATE POLICY "Service can insert briefings" ON turn_briefings
  FOR INSERT WITH CHECK (true);
