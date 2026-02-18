
-- 1. Add turn_from and turn_to to chronicle_entries for range tracking
ALTER TABLE public.chronicle_entries ADD COLUMN IF NOT EXISTS turn_from integer;
ALTER TABLE public.chronicle_entries ADD COLUMN IF NOT EXISTS turn_to integer;

-- 2. Add importance to game_events (normal/memorable/legendary)
ALTER TABLE public.game_events ADD COLUMN IF NOT EXISTS importance text NOT NULL DEFAULT 'normal';

-- 3. Create turn_summaries table for turn progression
CREATE TABLE public.turn_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  status text NOT NULL DEFAULT 'active', -- active, waiting, closed
  closed_at timestamp with time zone,
  closed_by text,
  summary_text text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(session_id, turn_number)
);

ALTER TABLE public.turn_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to turn summaries"
ON public.turn_summaries FOR ALL
USING (true)
WITH CHECK (true);

-- 4. Create world_feed_items table for FM-style news feed
CREATE TABLE public.world_feed_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  feed_type text NOT NULL DEFAULT 'gossip', -- gossip, trader_report, war_rumor, cultural, verified
  content text NOT NULL,
  linked_event_id uuid REFERENCES public.game_events(id),
  linked_city text,
  importance text NOT NULL DEFAULT 'normal', -- normal, memorable, legendary
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.world_feed_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to world feed items"
ON public.world_feed_items FOR ALL
USING (true)
WITH CHECK (true);

-- 5. Create world_action_log - immutable audit trail
CREATE TABLE public.world_action_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  turn_number integer NOT NULL,
  action_type text NOT NULL, -- battle, build, diplomacy, trade, event, declaration, etc.
  description text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.world_action_log ENABLE ROW LEVEL SECURITY;

-- Only admin can read, nobody can update/delete (immutable)
CREATE POLICY "Public read access to action log"
ON public.world_action_log FOR SELECT
USING (true);

CREATE POLICY "Insert access to action log"
ON public.world_action_log FOR INSERT
WITH CHECK (true);

-- Enable realtime for turn_summaries and world_feed_items
ALTER PUBLICATION supabase_realtime ADD TABLE public.turn_summaries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.world_feed_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.world_action_log;
