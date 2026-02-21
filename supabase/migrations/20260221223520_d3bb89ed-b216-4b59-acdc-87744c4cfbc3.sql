
-- 1) Add world_seed to game_sessions
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS world_seed TEXT;

-- 2) Create macro_regions table
CREATE TABLE public.macro_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  region_key TEXT NOT NULL,
  name TEXT NOT NULL,
  climate_band INT NOT NULL DEFAULT 2,
  elevation_band INT NOT NULL DEFAULT 2,
  moisture_band INT NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, region_key)
);

ALTER TABLE public.macro_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to macro_regions"
  ON public.macro_regions FOR ALL
  USING (true) WITH CHECK (true);

-- 3) Create province_hexes table
CREATE TABLE public.province_hexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  q INT NOT NULL,
  r INT NOT NULL,
  seed TEXT NOT NULL,
  mean_height INT NOT NULL DEFAULT 50,
  moisture_band INT NOT NULL DEFAULT 2,
  temp_band INT NOT NULL DEFAULT 2,
  biome_family TEXT NOT NULL DEFAULT 'plains',
  coastal BOOLEAN NOT NULL DEFAULT false,
  macro_region_id UUID REFERENCES public.macro_regions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, q, r)
);

ALTER TABLE public.province_hexes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to province_hexes"
  ON public.province_hexes FOR ALL
  USING (true) WITH CHECK (true);

-- Index for neighbor lookups
CREATE INDEX idx_province_hexes_coords ON public.province_hexes(session_id, q, r);
CREATE INDEX idx_province_hexes_macro ON public.province_hexes(macro_region_id);
