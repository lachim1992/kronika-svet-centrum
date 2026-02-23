
-- Add event_id FK and source_type to chronicle_entries
ALTER TABLE public.chronicle_entries 
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.game_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'chronicle';

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_chronicle_entries_event_id ON public.chronicle_entries(event_id);
CREATE INDEX IF NOT EXISTS idx_chronicle_entries_source_type ON public.chronicle_entries(source_type);

COMMENT ON COLUMN public.chronicle_entries.source_type IS 'chronicle = AI-generated narrative, system = auto-generated log, founding = city founding record';
