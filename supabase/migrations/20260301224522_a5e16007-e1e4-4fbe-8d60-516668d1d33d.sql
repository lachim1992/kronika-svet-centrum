
-- Games chat/comments table for live Olympic commentary
CREATE TABLE public.games_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  festival_id uuid NOT NULL REFERENCES public.games_festivals(id),
  player_name text NOT NULL,
  message text NOT NULL,
  reply_to_id uuid REFERENCES public.games_comments(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.games_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view games comments" ON public.games_comments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert games comments" ON public.games_comments FOR INSERT WITH CHECK (true);

CREATE INDEX idx_games_comments_festival ON public.games_comments(festival_id, created_at);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.games_comments;
