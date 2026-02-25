
-- Add structured bonuses derived from civ DNA (cultural_quirk, architectural_style, core_myth)
ALTER TABLE public.civilizations 
ADD COLUMN civ_bonuses jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.civilizations.civ_bonuses IS 'Structured gameplay modifiers derived from civ DNA text fields (stability_modifier, fortification_bonus, growth_modifier, diplomacy_modifier, morale_modifier, build_speed_modifier, trade_modifier)';
