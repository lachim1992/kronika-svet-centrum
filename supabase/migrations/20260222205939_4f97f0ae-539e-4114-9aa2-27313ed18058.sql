-- Add book publishing fields to saga_versions
ALTER TABLE public.saga_versions
  ADD COLUMN IF NOT EXISTS chronicler_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS published_as_book boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS book_title text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS history_text text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_summary jsonb DEFAULT '{}'::jsonb;