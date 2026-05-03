ALTER TABLE public.chronicle_entries
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS highlights jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS referenced_event_ids uuid[] DEFAULT ARRAY[]::uuid[];