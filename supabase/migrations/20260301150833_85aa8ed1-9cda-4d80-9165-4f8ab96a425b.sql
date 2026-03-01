
-- Extend civ_identity with new mechanical modifiers for unified faction system
ALTER TABLE public.civ_identity
  ADD COLUMN IF NOT EXISTS wood_modifier numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stone_modifier numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iron_modifier numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wealth_modifier numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pop_growth_modifier numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_burgher_ratio numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_cleric_ratio numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cavalry_bonus numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fortification_bonus numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS building_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS flavor_summary text;

-- Add comments for documentation
COMMENT ON COLUMN public.civ_identity.wood_modifier IS 'Multiplicative bonus to wood production (-0.2 to +0.3)';
COMMENT ON COLUMN public.civ_identity.stone_modifier IS 'Multiplicative bonus to stone production (-0.2 to +0.3)';
COMMENT ON COLUMN public.civ_identity.iron_modifier IS 'Multiplicative bonus to iron production (-0.2 to +0.3)';
COMMENT ON COLUMN public.civ_identity.wealth_modifier IS 'Multiplicative bonus to wealth/gold income (-0.2 to +0.3)';
COMMENT ON COLUMN public.civ_identity.pop_growth_modifier IS 'Additive modifier to population growth rate (-0.01 to +0.02)';
COMMENT ON COLUMN public.civ_identity.initial_burgher_ratio IS 'Deviation from template burgher ratio (-0.15 to +0.2)';
COMMENT ON COLUMN public.civ_identity.initial_cleric_ratio IS 'Deviation from template cleric ratio (-0.1 to +0.15)';
COMMENT ON COLUMN public.civ_identity.cavalry_bonus IS 'Bonus to cavalry unit effectiveness (0 to 0.3)';
COMMENT ON COLUMN public.civ_identity.fortification_bonus IS 'Bonus to city defense multiplier (0 to 0.25)';
COMMENT ON COLUMN public.civ_identity.building_tags IS 'Special building types unlocked by this civilization';
COMMENT ON COLUMN public.civ_identity.display_name IS 'AI-generated display name for the faction';
COMMENT ON COLUMN public.civ_identity.flavor_summary IS 'AI-generated one-line flavor summary';
