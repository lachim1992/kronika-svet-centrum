
-- Settlement resource profiles
CREATE TABLE public.settlement_resource_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city_id UUID NOT NULL UNIQUE REFERENCES public.cities(id) ON DELETE CASCADE,
  produces_grain BOOLEAN NOT NULL DEFAULT true,
  produces_wood BOOLEAN NOT NULL DEFAULT true,
  special_resource_type TEXT NOT NULL DEFAULT 'NONE' CHECK (special_resource_type IN ('NONE', 'STONE', 'IRON')),
  base_grain INTEGER NOT NULL DEFAULT 8,
  base_wood INTEGER NOT NULL DEFAULT 6,
  base_special INTEGER NOT NULL DEFAULT 0,
  founded_seed TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.settlement_resource_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to settlement resource profiles"
  ON public.settlement_resource_profiles FOR ALL USING (true) WITH CHECK (true);

-- Add per-turn production cache columns to realm_resources
ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS last_turn_wood_prod INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_turn_stone_prod INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_turn_iron_prod INTEGER NOT NULL DEFAULT 0;

-- Add per-city cached production columns to cities
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS last_turn_wood_prod INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_turn_special_prod INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_resource_type TEXT NOT NULL DEFAULT 'NONE';

-- Backfill existing cities with resource profiles
INSERT INTO public.settlement_resource_profiles (city_id, produces_grain, produces_wood, special_resource_type, base_grain, base_wood, base_special, founded_seed)
SELECT
  c.id,
  true,
  true,
  CASE
    WHEN (abs(hashtext(c.id::text)) % 100) < 25 THEN 'IRON'
    WHEN (abs(hashtext(c.id::text)) % 100) < 50 THEN 'STONE'
    ELSE 'NONE'
  END,
  CASE c.settlement_level
    WHEN 'HAMLET' THEN 8
    WHEN 'TOWNSHIP' THEN 10
    WHEN 'CITY' THEN 12
    WHEN 'POLIS' THEN 14
    ELSE 8
  END,
  CASE c.settlement_level
    WHEN 'HAMLET' THEN 6
    WHEN 'TOWNSHIP' THEN 7
    WHEN 'CITY' THEN 8
    WHEN 'POLIS' THEN 9
    ELSE 6
  END,
  CASE
    WHEN (abs(hashtext(c.id::text)) % 100) < 50 THEN
      CASE c.settlement_level
        WHEN 'HAMLET' THEN 2
        WHEN 'TOWNSHIP' THEN 3
        WHEN 'CITY' THEN 4
        WHEN 'POLIS' THEN 5
        ELSE 2
      END
    ELSE 0
  END,
  c.id::text
FROM public.cities c
WHERE NOT EXISTS (SELECT 1 FROM public.settlement_resource_profiles srp WHERE srp.city_id = c.id);

-- Backfill cities.special_resource_type from profiles
UPDATE public.cities c
SET special_resource_type = srp.special_resource_type
FROM public.settlement_resource_profiles srp
WHERE srp.city_id = c.id AND c.special_resource_type = 'NONE' AND srp.special_resource_type != 'NONE';
