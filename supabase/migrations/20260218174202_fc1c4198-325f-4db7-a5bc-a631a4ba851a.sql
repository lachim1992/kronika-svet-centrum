
-- 1) New world_events table
CREATE TABLE public.world_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  date text,
  date_precision text NOT NULL DEFAULT 'unknown',
  summary text,
  description text,
  location_id uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] DEFAULT '{}'::text[],
  related_event_ids uuid[] DEFAULT '{}'::uuid[],
  "references" jsonb DEFAULT '[]'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_events_date_precision_check CHECK (date_precision IN ('exact', 'approx', 'unknown')),
  CONSTRAINT world_events_slug_session_unique UNIQUE (session_id, slug)
);

ALTER TABLE public.world_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to world events" ON public.world_events FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_world_events_updated_at
  BEFORE UPDATE ON public.world_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_world_events_session ON public.world_events(session_id);
CREATE INDEX idx_world_events_slug ON public.world_events(session_id, slug);
CREATE INDEX idx_world_events_location ON public.world_events(location_id);

-- 2) Add "references" JSONB to all text-bearing tables
ALTER TABLE public.chronicle_entries ADD COLUMN "references" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.event_narratives ADD COLUMN "references" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.wiki_entries ADD COLUMN "references" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.world_history_chapters ADD COLUMN "references" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.player_chronicle_chapters ADD COLUMN "references" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.world_feed_items ADD COLUMN "references" jsonb DEFAULT '[]'::jsonb;
