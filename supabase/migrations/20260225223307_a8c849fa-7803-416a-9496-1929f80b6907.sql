
-- Add static_identity and last_enriched_turn to wiki_entries
ALTER TABLE public.wiki_entries ADD COLUMN IF NOT EXISTS static_identity jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.wiki_entries ADD COLUMN IF NOT EXISTS last_enriched_turn integer DEFAULT 0;
ALTER TABLE public.wiki_entries ADD COLUMN IF NOT EXISTS body_md text;

-- Create wiki_event_refs table for structured facts (no AI, just data)
CREATE TABLE IF NOT EXISTS public.wiki_event_refs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL,
  entity_type text NOT NULL,
  ref_type text NOT NULL DEFAULT 'event',
  ref_id uuid NOT NULL,
  ref_label text NOT NULL DEFAULT '',
  turn_number integer NOT NULL DEFAULT 1,
  impact_score integer NOT NULL DEFAULT 1,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(session_id, entity_id, ref_type, ref_id)
);

ALTER TABLE public.wiki_event_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to wiki_event_refs"
  ON public.wiki_event_refs FOR ALL
  USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_wiki_event_refs_entity ON public.wiki_event_refs(session_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_wiki_event_refs_turn ON public.wiki_event_refs(session_id, turn_number);
