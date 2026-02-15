
-- Game sessions
CREATE TABLE public.game_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  player1_name TEXT NOT NULL DEFAULT 'Hráč 1',
  player2_name TEXT NOT NULL DEFAULT 'Hráč 2',
  epoch_style TEXT NOT NULL DEFAULT 'kroniky',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to game sessions" ON public.game_sessions FOR ALL USING (true) WITH CHECK (true);

-- Game events
CREATE TABLE public.game_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  player TEXT NOT NULL,
  location TEXT,
  note TEXT,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  turn_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to game events" ON public.game_events FOR ALL USING (true) WITH CHECK (true);

-- Event responses
CREATE TABLE public.event_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.game_events(id) ON DELETE CASCADE,
  player TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to event responses" ON public.event_responses FOR ALL USING (true) WITH CHECK (true);

-- World memories
CREATE TABLE public.world_memories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.world_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to world memories" ON public.world_memories FOR ALL USING (true) WITH CHECK (true);

-- City states
CREATE TABLE public.city_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Obchodní',
  mood TEXT NOT NULL DEFAULT 'Neutrální',
  influence_p1 INTEGER NOT NULL DEFAULT 0,
  influence_p2 INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.city_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to city states" ON public.city_states FOR ALL USING (true) WITH CHECK (true);

-- Chronicle entries
CREATE TABLE public.chronicle_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  epoch_style TEXT NOT NULL DEFAULT 'kroniky',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chronicle_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to chronicle entries" ON public.chronicle_entries FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.world_memories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chronicle_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.city_states;
