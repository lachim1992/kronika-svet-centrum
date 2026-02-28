
-- Battle Lobbies table for the shared pre-battle preparation phase
CREATE TABLE public.battle_lobbies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL DEFAULT 1,
  
  -- Sides
  attacker_stack_id UUID NOT NULL REFERENCES public.military_stacks(id),
  attacker_player TEXT NOT NULL,
  defender_stack_id UUID REFERENCES public.military_stacks(id),
  defender_city_id UUID REFERENCES public.cities(id),
  defender_player TEXT NOT NULL,
  
  -- Tactics (rock-paper-scissors)
  attacker_formation TEXT NOT NULL DEFAULT 'ASSAULT',
  defender_formation TEXT NOT NULL DEFAULT 'DEFENSIVE',
  
  -- Speeches
  attacker_speech TEXT,
  defender_speech TEXT,
  attacker_speech_modifier INTEGER DEFAULT 0,
  defender_speech_modifier INTEGER DEFAULT 0,
  attacker_speech_feedback TEXT,
  defender_speech_feedback TEXT,
  
  -- Readiness
  attacker_ready BOOLEAN NOT NULL DEFAULT false,
  defender_ready BOOLEAN NOT NULL DEFAULT false,
  
  -- Surrender / capitulation
  surrender_offered_by TEXT,
  surrender_terms JSONB,
  surrender_accepted BOOLEAN,
  
  -- Resolution
  status TEXT NOT NULL DEFAULT 'preparing',
  battle_id UUID REFERENCES public.battles(id),
  resolved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_battle_lobbies_session ON public.battle_lobbies(session_id, status);
CREATE INDEX idx_battle_lobbies_players ON public.battle_lobbies(session_id, attacker_player, defender_player);

-- Enable RLS
ALTER TABLE public.battle_lobbies ENABLE ROW LEVEL SECURITY;

-- Policies: participants can view their lobbies
CREATE POLICY "Players can view battle lobbies in their session"
  ON public.battle_lobbies FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert battle lobbies"
  ON public.battle_lobbies FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Participants can update their battle lobbies"
  ON public.battle_lobbies FOR UPDATE
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_battle_lobbies_updated_at
  BEFORE UPDATE ON public.battle_lobbies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for lobby synchronization
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_lobbies;
