
-- Sphaera Feed Items table for FM-style news
CREATE TABLE public.sphaera_feed_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.game_sessions(id) ON DELETE CASCADE NOT NULL,
  season_id UUID REFERENCES public.league_seasons(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL DEFAULT 0,
  turn_number INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'match_result',
  headline TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  importance INTEGER NOT NULL DEFAULT 1,
  icon TEXT NOT NULL DEFAULT '📰',
  team_id UUID REFERENCES public.league_teams(id) ON DELETE SET NULL,
  player_id UUID,
  match_id UUID REFERENCES public.league_matches(id) ON DELETE SET NULL,
  city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  city_name TEXT,
  team_name TEXT,
  player_name_ref TEXT,
  ai_comment TEXT,
  ai_comment_author TEXT DEFAULT 'Kronikář',
  entity_refs JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast querying
CREATE INDEX idx_sphaera_feed_session_round ON public.sphaera_feed_items(session_id, round_number DESC);
CREATE INDEX idx_sphaera_feed_session_turn ON public.sphaera_feed_items(session_id, turn_number DESC);

-- Enable RLS
ALTER TABLE public.sphaera_feed_items ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Anyone can read sphaera feed" ON public.sphaera_feed_items
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert (from edge functions via service key)
CREATE POLICY "Service can insert sphaera feed" ON public.sphaera_feed_items
  FOR INSERT TO authenticated WITH CHECK (true);

-- Enable realtime for feed comments on sphaera
ALTER PUBLICATION supabase_realtime ADD TABLE public.sphaera_feed_items;
