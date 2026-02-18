
-- Add biome/terrain type to regions
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS biome text DEFAULT 'plains';
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS is_homeland boolean DEFAULT false;
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS discovered_turn integer;
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS discovered_by text;

-- Create exploration expeditions table
CREATE TABLE public.expeditions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id),
  player_name text NOT NULL,
  expedition_type text NOT NULL DEFAULT 'explore',
  status text NOT NULL DEFAULT 'active',
  launched_turn integer NOT NULL,
  resolved_turn integer,
  result_region_id uuid REFERENCES public.regions(id),
  narrative text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.expeditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to expeditions"
  ON public.expeditions FOR ALL
  USING (true) WITH CHECK (true);
