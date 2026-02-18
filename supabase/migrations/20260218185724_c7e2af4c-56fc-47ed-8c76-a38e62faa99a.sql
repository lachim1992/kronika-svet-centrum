
-- Create dedicated city_rumors table
CREATE TABLE public.city_rumors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  city_name TEXT NOT NULL,
  related_event_id UUID REFERENCES public.game_events(id) ON DELETE SET NULL,
  related_world_event_id UUID REFERENCES public.world_events(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  tone_tag TEXT NOT NULL DEFAULT 'neutral',
  created_by TEXT NOT NULL DEFAULT 'system',
  is_draft BOOLEAN NOT NULL DEFAULT false,
  draft_expires_turn INTEGER,
  turn_number INTEGER NOT NULL DEFAULT 1,
  entity_refs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.city_rumors ENABLE ROW LEVEL SECURITY;

-- Public read/write for MVP
CREATE POLICY "Public access to city rumors"
  ON public.city_rumors
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_city_rumors_session ON public.city_rumors(session_id);
CREATE INDEX idx_city_rumors_city ON public.city_rumors(city_id);
CREATE INDEX idx_city_rumors_event ON public.city_rumors(related_event_id);
CREATE INDEX idx_city_rumors_world_event ON public.city_rumors(related_world_event_id);
CREATE INDEX idx_city_rumors_turn ON public.city_rumors(turn_number DESC);
CREATE INDEX idx_city_rumors_draft ON public.city_rumors(is_draft) WHERE is_draft = true;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.city_rumors;
