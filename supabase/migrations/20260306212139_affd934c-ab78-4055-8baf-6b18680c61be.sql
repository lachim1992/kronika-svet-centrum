ALTER TABLE public.civ_identity 
  ADD COLUMN IF NOT EXISTS diplomacy_modifier numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS research_modifier numeric NOT NULL DEFAULT 0;