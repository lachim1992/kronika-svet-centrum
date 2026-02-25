
-- Demographic system columns on cities
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS housing_capacity integer NOT NULL DEFAULT 500;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS disease_level integer NOT NULL DEFAULT 0;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS migration_pressure real NOT NULL DEFAULT 0;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS mobility_rate real NOT NULL DEFAULT 0;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS last_migration_in integer NOT NULL DEFAULT 0;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS last_migration_out integer NOT NULL DEFAULT 0;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS epidemic_active boolean NOT NULL DEFAULT false;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS epidemic_turn_start integer DEFAULT NULL;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS overcrowding_ratio real NOT NULL DEFAULT 0;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS birth_rate real NOT NULL DEFAULT 0.01;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS death_rate real NOT NULL DEFAULT 0.005;
