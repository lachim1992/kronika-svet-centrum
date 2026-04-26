ALTER TABLE public.player_civ_configs
ADD COLUMN IF NOT EXISTS founding_legend text;

COMMENT ON COLUMN public.player_civ_configs.founding_legend IS 'Player-authored founding myth / origin legend (max ~800 chars), woven into prehistory and Chronicle Zero.';