-- Add typed prestige columns to realm_resources
ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS military_prestige INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS economic_prestige INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cultural_prestige INTEGER NOT NULL DEFAULT 0;

-- Add festival_results JSONB to games_festivals for rich instant output
ALTER TABLE public.games_festivals
  ADD COLUMN IF NOT EXISTS festival_results JSONB DEFAULT '{}';

-- Add local_renown to cities for local festival impact tracking
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS local_renown INTEGER NOT NULL DEFAULT 0;