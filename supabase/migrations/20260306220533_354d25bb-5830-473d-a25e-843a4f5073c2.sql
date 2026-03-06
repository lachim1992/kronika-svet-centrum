ALTER TABLE public.civ_identity 
  ADD COLUMN IF NOT EXISTS militia_unit_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS militia_unit_desc text DEFAULT '',
  ADD COLUMN IF NOT EXISTS professional_unit_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS professional_unit_desc text DEFAULT '';