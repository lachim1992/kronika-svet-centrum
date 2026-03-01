
-- Per-discipline reveal state for the new "host controls each discipline" flow
CREATE TABLE public.games_discipline_reveals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  festival_id UUID NOT NULL REFERENCES public.games_festivals(id) ON DELETE CASCADE,
  discipline_id UUID NOT NULL REFERENCES public.games_disciplines(id),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, resolving, resolved
  reveal_script JSONB DEFAULT '[]'::jsonb,
  crowd_reactions JSONB DEFAULT '[]'::jsonb, -- AI-generated audience reactions
  medal_snapshot JSONB DEFAULT '{}'::jsonb, -- cumulative medal tally after this discipline
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(festival_id, discipline_id)
);

-- Enable RLS
ALTER TABLE public.games_discipline_reveals ENABLE ROW LEVEL SECURITY;

-- Everyone in the session can read
CREATE POLICY "Players can view discipline reveals"
  ON public.games_discipline_reveals FOR SELECT
  USING (true);

-- Only service role inserts (edge functions)
CREATE POLICY "Service role manages discipline reveals"
  ON public.games_discipline_reveals FOR ALL
  USING (true) WITH CHECK (true);

-- Enable realtime for live broadcasting
ALTER PUBLICATION supabase_realtime ADD TABLE public.games_discipline_reveals;

-- Add reveal_order to games_disciplines for host to see order
ALTER TABLE public.games_disciplines ADD COLUMN IF NOT EXISTS reveal_order INTEGER DEFAULT 0;
