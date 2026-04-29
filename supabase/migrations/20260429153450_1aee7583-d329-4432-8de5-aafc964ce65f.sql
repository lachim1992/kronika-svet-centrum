ALTER TABLE public.military_stacks
  ADD COLUMN IF NOT EXISTS unit_count integer NOT NULL DEFAULT 0;