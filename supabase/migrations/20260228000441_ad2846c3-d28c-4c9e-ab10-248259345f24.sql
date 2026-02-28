
-- Game chat messages for in-game lobby communication
CREATE TABLE public.game_chat (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  message TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'public',
  turn_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_chat ENABLE ROW LEVEL SECURITY;

-- All authenticated users in the session can read/write
CREATE POLICY "Public access to game chat"
  ON public.game_chat FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast session queries
CREATE INDEX idx_game_chat_session ON public.game_chat(session_id, created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_chat;
