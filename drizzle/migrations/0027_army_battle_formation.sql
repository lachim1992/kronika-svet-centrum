ALTER TABLE public.military_stacks ADD COLUMN IF NOT EXISTS battle_formation text NOT NULL DEFAULT 'line';
ALTER TABLE public.military_stacks DROP CONSTRAINT IF EXISTS military_stacks_battle_formation_chk;
ALTER TABLE public.military_stacks ADD CONSTRAINT military_stacks_battle_formation_chk CHECK (battle_formation IN ('line','wedge','square','column','skirmish'));