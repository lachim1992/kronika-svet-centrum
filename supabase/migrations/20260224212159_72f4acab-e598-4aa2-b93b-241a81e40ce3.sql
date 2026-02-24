-- Add confirmed flags for stack visuals
ALTER TABLE public.military_stacks ADD COLUMN IF NOT EXISTS image_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.military_stacks ADD COLUMN IF NOT EXISTS sigil_confirmed boolean NOT NULL DEFAULT false;