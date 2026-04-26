-- Extend player_civ_configs with full civilization setup fields
ALTER TABLE public.player_civ_configs
  ADD COLUMN IF NOT EXISTS ruler_name      text,
  ADD COLUMN IF NOT EXISTS ruler_title     text,
  ADD COLUMN IF NOT EXISTS ruler_archetype text,
  ADD COLUMN IF NOT EXISTS ruler_bio       text,
  ADD COLUMN IF NOT EXISTS government_form text,
  ADD COLUMN IF NOT EXISTS trade_ideology  text,
  ADD COLUMN IF NOT EXISTS dominant_faith  text,
  ADD COLUMN IF NOT EXISTS faith_attitude  text,
  ADD COLUMN IF NOT EXISTS spawn_preference text,
  ADD COLUMN IF NOT EXISTS lineage_ids     text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS secret_objective_archetype text,
  ADD COLUMN IF NOT EXISTS heraldry        jsonb DEFAULT '{}'::jsonb;