
-- Add location and category columns to world_memories
ALTER TABLE public.world_memories
  ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS province_id uuid REFERENCES public.provinces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'tradition',
  ADD COLUMN IF NOT EXISTS created_round integer NOT NULL DEFAULT 1;

-- Create index for city-level memory lookups
CREATE INDEX IF NOT EXISTS idx_world_memories_city_id ON public.world_memories(city_id);
CREATE INDEX IF NOT EXISTS idx_world_memories_province_id ON public.world_memories(province_id);
