
-- Add cached metrics columns to cities
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS last_turn_grain_prod integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_turn_grain_cons integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS city_description_cached text,
  ADD COLUMN IF NOT EXISTS city_description_last_turn integer NOT NULL DEFAULT 0;

-- Add cached realm turn summary columns to realm_resources
ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS last_turn_grain_prod integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_turn_grain_cons integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_turn_grain_net integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS famine_city_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS realm_report_cached text,
  ADD COLUMN IF NOT EXISTS realm_report_last_turn integer NOT NULL DEFAULT 0;
