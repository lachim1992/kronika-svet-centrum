
-- Create discoveries table for fog-of-war visibility
CREATE TABLE public.discoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  entity_type text NOT NULL, -- 'region', 'province', 'city', 'country', 'wonder', 'person'
  entity_id uuid NOT NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'admin', -- 'expedition_player', 'expedition_unknown', 'admin', 'founding', 'rumor'
  UNIQUE(session_id, player_name, entity_type, entity_id)
);

-- Enable RLS
ALTER TABLE public.discoveries ENABLE ROW LEVEL SECURITY;

-- Public read/write for now (game uses player_name not auth)
CREATE POLICY "Public access to discoveries"
  ON public.discoveries
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_discoveries_session_player ON public.discoveries(session_id, player_name);
CREATE INDEX idx_discoveries_entity ON public.discoveries(entity_type, entity_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.discoveries;
