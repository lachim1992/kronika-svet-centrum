
-- Add image/sigil columns to military_stacks
ALTER TABLE public.military_stacks
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_prompt text,
  ADD COLUMN IF NOT EXISTS sigil_url text,
  ADD COLUMN IF NOT EXISTS sigil_prompt text;

-- Add bio/image columns to generals
ALTER TABLE public.generals
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_prompt text,
  ADD COLUMN IF NOT EXISTS flavor_trait text;

-- Add realm-level army sigil to realm_resources
ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS army_sigil_url text,
  ADD COLUMN IF NOT EXISTS army_sigil_prompt text;

-- Unit type visualizations table (per player, per unit_type)
CREATE TABLE IF NOT EXISTS public.unit_type_visuals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  player_name text NOT NULL,
  unit_type text NOT NULL,
  image_url text,
  image_prompt text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(session_id, player_name, unit_type)
);

ALTER TABLE public.unit_type_visuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to unit type visuals"
  ON public.unit_type_visuals FOR ALL
  USING (true) WITH CHECK (true);
