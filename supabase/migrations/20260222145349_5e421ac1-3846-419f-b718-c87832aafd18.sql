
-- Add physics columns to cities
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS development_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS influence_score double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_tick_at timestamptz;

-- Create index for tick queries
CREATE INDEX IF NOT EXISTS idx_cities_session_last_tick ON public.cities (session_id, last_tick_at);
