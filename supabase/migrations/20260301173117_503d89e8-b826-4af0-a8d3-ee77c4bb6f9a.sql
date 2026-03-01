
-- Add reveal script and phase tracking to games_festivals
ALTER TABLE public.games_festivals
  ADD COLUMN IF NOT EXISTS reveal_script JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reveal_phase TEXT DEFAULT 'pending';

-- COMMENT: reveal_phase values: 'pending' | 'computed' | 'revealing' | 'complete'
-- reveal_script stores pre-computed reveal steps for cinematic playback
