
-- Comments on feed items (rumors or events)
CREATE TABLE public.feed_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL DEFAULT 'rumor', -- 'rumor' or 'event'
  target_id UUID NOT NULL,
  player_name TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  turn_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to feed comments" ON public.feed_comments FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_feed_comments_target ON public.feed_comments(session_id, target_type, target_id, created_at);
ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_comments;

-- Emoji reactions on feed items
CREATE TABLE public.feed_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL DEFAULT 'rumor',
  target_id UUID NOT NULL,
  player_name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, target_type, target_id, player_name, emoji)
);

ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to feed reactions" ON public.feed_reactions FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_feed_reactions_target ON public.feed_reactions(session_id, target_type, target_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_reactions;
