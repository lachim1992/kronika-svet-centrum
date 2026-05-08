ALTER TABLE public.battle_lobbies
  ADD COLUMN IF NOT EXISTS attacker_intent text NOT NULL DEFAULT 'occupy',
  ADD COLUMN IF NOT EXISTS defender_reinforcement_stack_ids jsonb NOT NULL DEFAULT '[]'::jsonb;