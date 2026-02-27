-- Add persistent cache for generated history and saga structured data
ALTER TABLE public.wiki_entries 
  ADD COLUMN IF NOT EXISTS history_cache jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS saga_cache jsonb DEFAULT NULL;