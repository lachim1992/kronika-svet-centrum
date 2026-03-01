-- Records & Achievements table
CREATE TABLE public.game_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL DEFAULT 'discipline_record', -- discipline_record, close_match, dominant_win, military_merit
  category TEXT NOT NULL DEFAULT 'sports', -- sports, military
  
  -- Who
  entity_id TEXT, -- participant_id, stack_id, or general person id
  entity_name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'person', -- person, army
  player_name TEXT NOT NULL,
  portrait_url TEXT,
  
  -- What
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Context
  discipline_id UUID, -- for sports records
  discipline_name TEXT,
  festival_id UUID, -- for sports records
  festival_name TEXT,
  battle_id UUID, -- for military records
  
  -- Metrics
  score NUMERIC,
  previous_record NUMERIC,
  margin NUMERIC, -- how much better/closer
  
  -- Media
  image_url TEXT,
  image_prompt TEXT,
  
  -- Wiki integration
  wiki_entry_id UUID,
  world_event_id UUID,
  
  -- Meta
  turn_number INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_records ENABLE ROW LEVEL SECURITY;

-- Everyone in the session can read records
CREATE POLICY "Anyone can view game records"
  ON public.game_records FOR SELECT
  USING (true);

-- Only system (service role) inserts records
CREATE POLICY "Service role inserts records"
  ON public.game_records FOR INSERT
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_game_records_session ON public.game_records(session_id);
CREATE INDEX idx_game_records_type ON public.game_records(session_id, record_type);
CREATE INDEX idx_game_records_player ON public.game_records(session_id, player_name);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_records;