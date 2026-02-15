
-- Table for world history chapters (global canon retelling)
CREATE TABLE public.world_history_chapters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  chapter_title text NOT NULL,
  chapter_text text NOT NULL,
  from_turn integer NOT NULL DEFAULT 1,
  to_turn integer NOT NULL DEFAULT 1,
  epoch_style text NOT NULL DEFAULT 'kroniky',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.world_history_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to world history chapters" ON public.world_history_chapters FOR ALL USING (true) WITH CHECK (true);

-- Table for player-specific chronicle chapters (subjective perspective)
CREATE TABLE public.player_chronicle_chapters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  chapter_title text NOT NULL,
  chapter_text text NOT NULL,
  from_turn integer NOT NULL DEFAULT 1,
  to_turn integer NOT NULL DEFAULT 1,
  epoch_style text NOT NULL DEFAULT 'kroniky',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.player_chronicle_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to player chronicle chapters" ON public.player_chronicle_chapters FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.world_history_chapters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_chronicle_chapters;
