ALTER TABLE public.civ_identity 
  ADD COLUMN IF NOT EXISTS special_buildings jsonb NOT NULL DEFAULT '[]'::jsonb;