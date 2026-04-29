ALTER TABLE public.military_stacks
  ADD COLUMN IF NOT EXISTS owner_player text;

UPDATE public.military_stacks
  SET owner_player = player_name
  WHERE owner_player IS NULL;

CREATE INDEX IF NOT EXISTS idx_military_stacks_owner_player
  ON public.military_stacks(session_id, owner_player);