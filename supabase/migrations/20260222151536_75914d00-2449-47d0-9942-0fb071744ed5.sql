
-- Languages table
CREATE TABLE public.languages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  phonetics TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to languages" ON public.languages FOR ALL USING (true) WITH CHECK (true);

-- Cultures table
CREATE TABLE public.cultures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  values_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cultures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to cultures" ON public.cultures FOR ALL USING (true) WITH CHECK (true);

-- Add culture_id and language_id to cities
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS culture_id UUID REFERENCES public.cultures(id),
  ADD COLUMN IF NOT EXISTS language_id UUID REFERENCES public.languages(id);

-- Add init_status to game_sessions
ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS init_status TEXT NOT NULL DEFAULT 'pending';
