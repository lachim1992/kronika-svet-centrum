ALTER TABLE public.wiki_entries
  ADD COLUMN IF NOT EXISTS content_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS image_generation_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS generation_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_generated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_wiki_entries_generation_status
  ON public.wiki_entries (session_id, generation_status);
