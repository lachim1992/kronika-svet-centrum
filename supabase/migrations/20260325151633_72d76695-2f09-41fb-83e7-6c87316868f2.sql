
-- Add new strategic resource tier columns to realm_resources
ALTER TABLE public.realm_resources 
  ADD COLUMN IF NOT EXISTS strategic_marble_tier integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategic_gems_tier integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategic_timber_tier integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategic_obsidian_tier integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategic_silk_tier integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategic_incense_tier integer NOT NULL DEFAULT 0;

-- Add prestige sub-columns
ALTER TABLE public.realm_resources 
  ADD COLUMN IF NOT EXISTS geopolitical_prestige numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS technological_prestige numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sport_prestige numeric NOT NULL DEFAULT 0;

-- Rename gold_reserve to wealth_reserve for clarity (keep gold_reserve as alias)
-- Actually we keep gold_reserve as the DB column but treat it as wealth in UI
