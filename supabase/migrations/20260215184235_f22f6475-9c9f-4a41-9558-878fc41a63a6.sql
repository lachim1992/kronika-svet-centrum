
-- =============================================
-- PHASE 1: Multiplayer (2-6 players) + Empire Management
-- =============================================

-- 1) Replace fixed player1/player2 with a players table
CREATE TABLE public.game_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_number INTEGER NOT NULL,
  turn_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, player_number),
  UNIQUE(session_id, player_name)
);

ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to game players" ON public.game_players FOR ALL USING (true) WITH CHECK (true);

-- 2) Cities / Settlements registry
CREATE TABLE public.cities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  owner_player TEXT NOT NULL,
  name TEXT NOT NULL,
  province TEXT,
  level TEXT NOT NULL DEFAULT 'Osada',  -- Osada, Městečko, Město, Polis
  tags TEXT[] DEFAULT '{}',  -- port, fortress, holy_city, etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to cities" ON public.cities FOR ALL USING (true) WITH CHECK (true);

-- 3) Resource economy per player per session
CREATE TABLE public.player_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  resource_type TEXT NOT NULL,  -- food, wood, stone, iron, wealth
  income INTEGER NOT NULL DEFAULT 0,
  upkeep INTEGER NOT NULL DEFAULT 0,
  stockpile INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, player_name, resource_type)
);

ALTER TABLE public.player_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to player resources" ON public.player_resources FOR ALL USING (true) WITH CHECK (true);

-- 4) Iron capacity tracking
CREATE TABLE public.military_capacity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  army_name TEXT NOT NULL,
  army_type TEXT NOT NULL DEFAULT 'Lehká',  -- Lehká, Těžká, Obléhací, Námořní
  status TEXT NOT NULL DEFAULT 'Aktivní',  -- Aktivní, Poražená, Rozpuštěná
  iron_cost INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, player_name, army_name)
);

ALTER TABLE public.military_capacity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to military capacity" ON public.military_capacity FOR ALL USING (true) WITH CHECK (true);

-- 5) Tribute and trade log
CREATE TABLE public.trade_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL DEFAULT 1,
  from_player TEXT NOT NULL,
  to_player TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  trade_type TEXT NOT NULL DEFAULT 'Obchod',  -- Obchod, Tribut, Dar
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.trade_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to trade log" ON public.trade_log FOR ALL USING (true) WITH CHECK (true);

-- 6) Update game_sessions: increase max players, add max_players field
ALTER TABLE public.game_sessions ADD COLUMN max_players INTEGER NOT NULL DEFAULT 2;

-- 7) Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_resources;
ALTER PUBLICATION supabase_realtime ADD TABLE public.military_capacity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_log;
