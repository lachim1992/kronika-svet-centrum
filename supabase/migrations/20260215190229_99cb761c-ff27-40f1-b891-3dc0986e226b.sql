
-- Add new columns to cities table
ALTER TABLE public.cities 
ADD COLUMN IF NOT EXISTS founded_round integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ok',
ADD COLUMN IF NOT EXISTS flavor_prompt text;

-- Add city_id and secondary_city_id to game_events
ALTER TABLE public.game_events
ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.cities(id),
ADD COLUMN IF NOT EXISTS secondary_city_id uuid REFERENCES public.cities(id);

-- Add index for city event lookups
CREATE INDEX IF NOT EXISTS idx_game_events_city_id ON public.game_events(city_id);
CREATE INDEX IF NOT EXISTS idx_game_events_secondary_city_id ON public.game_events(secondary_city_id);
