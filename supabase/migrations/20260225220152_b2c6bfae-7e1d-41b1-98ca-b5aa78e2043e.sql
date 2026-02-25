
CREATE TABLE public.rumors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  category text NOT NULL DEFAULT 'society',
  scope text NOT NULL DEFAULT 'local',
  confidence integer NOT NULL DEFAULT 50,
  bias text NOT NULL DEFAULT 'peasant',
  tone text NOT NULL DEFAULT 'neutral',
  short_text text NOT NULL,
  expanded_text text,
  entity_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hash text NOT NULL,
  is_reminder boolean NOT NULL DEFAULT false,
  reminder_of_turn integer,
  CONSTRAINT rumors_source_hash_unique UNIQUE (session_id, source_hash)
);

CREATE INDEX idx_rumors_session_turn ON public.rumors(session_id, turn_number DESC);
CREATE INDEX idx_rumors_category ON public.rumors(category);
CREATE INDEX idx_rumors_scope ON public.rumors(scope);

ALTER TABLE public.rumors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to rumors"
  ON public.rumors FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.rumor_generation_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  rumors_generated integer NOT NULL DEFAULT 0,
  source_events_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rumor_gen_log_unique UNIQUE (session_id, turn_number)
);

ALTER TABLE public.rumor_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to rumor generation log"
  ON public.rumor_generation_log FOR ALL USING (true) WITH CHECK (true);
