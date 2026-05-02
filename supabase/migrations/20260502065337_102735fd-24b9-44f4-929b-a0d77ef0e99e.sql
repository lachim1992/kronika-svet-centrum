-- ═══ Vrstva 1: Military engine SSOT + Occupation 2-phase ═══

-- 1. Cities: occupation fields
ALTER TABLE public.cities 
  ADD COLUMN IF NOT EXISTS occupied_by text,
  ADD COLUMN IF NOT EXISTS occupation_turn integer,
  ADD COLUMN IF NOT EXISTS liberation_deadline_turn integer,
  ADD COLUMN IF NOT EXISTS occupation_loyalty integer DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_cities_occupied_by ON public.cities(session_id, occupied_by) WHERE occupied_by IS NOT NULL;

-- 2. battle_lobbies: AI control flags
ALTER TABLE public.battle_lobbies
  ADD COLUMN IF NOT EXISTS is_ai_attacker boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_ai_defender boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_responded_at timestamptz;

-- 3. Cleanup zaseknuté lobby (v session 0de6fab4 visí 14h)
UPDATE public.battle_lobbies 
SET status='abandoned', updated_at=now()
WHERE status='preparing' AND created_at < now() - interval '1 hour';

-- 4. Reset moved_this_turn pro session, ať Lachim může pokračovat
UPDATE public.military_stacks
SET moved_this_turn = false
WHERE session_id='0de6fab4-b925-4faf-bced-14ec85730f45' AND moved_this_turn = true;