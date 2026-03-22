-- Add warrior class to cities
ALTER TABLE public.cities 
  ADD COLUMN IF NOT EXISTS population_warriors INTEGER DEFAULT 0;

-- Add faith + military economy stats to realm_resources
ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS faith NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faith_growth NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warrior_ratio NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supply_strain NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mobilization_production_penalty NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mobilization_wealth_penalty NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_turn_faith_delta NUMERIC DEFAULT 0;