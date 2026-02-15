
-- =============================================
-- ENTITY TRAITS / PROPERTIES SYSTEM
-- =============================================
-- Stores traits/properties for cities, rulers, people
-- derived from game events, used as foundation for chronicle AI

CREATE TABLE public.entity_traits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- 'city', 'ruler', 'person', 'army', 'province'
  entity_name TEXT NOT NULL, -- name of the entity
  entity_id UUID, -- optional FK to cities/etc
  trait_category TEXT NOT NULL, -- 'reputation', 'title', 'characteristic', 'epithet', 'relation', 'history'
  trait_text TEXT NOT NULL, -- the actual trait description
  source_event_id UUID REFERENCES public.game_events(id) ON DELETE SET NULL,
  source_turn INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true, -- traits can be superseded
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.entity_traits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to entity traits" ON public.entity_traits FOR ALL USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_entity_traits_session ON public.entity_traits(session_id);
CREATE INDEX idx_entity_traits_entity ON public.entity_traits(entity_type, entity_name);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.entity_traits;
