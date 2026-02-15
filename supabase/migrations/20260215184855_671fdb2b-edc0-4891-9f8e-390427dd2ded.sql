
-- Wonders table
CREATE TABLE public.wonders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  owner_player TEXT NOT NULL,
  name TEXT NOT NULL,
  city_name TEXT,
  era TEXT NOT NULL DEFAULT 'Ancient',
  status TEXT NOT NULL DEFAULT 'planned',
  description TEXT,
  bonus TEXT,
  memory_fact TEXT,
  image_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.wonders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to wonders" ON public.wonders FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.wonders;
